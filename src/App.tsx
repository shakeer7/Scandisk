import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { 
  HardDrive, Settings, Search, Trash2, Home, Folder, 
  File, LayoutDashboard, PieChart as PieChartIcon, Sun, Moon,
  ChevronRight, ChevronLeft, ArrowLeft, ExternalLink, FolderOpen, Brush,
  Activity, Clock, AlertTriangle, Zap, HardDriveUpload
} from 'lucide-react';
import { 
  Treemap, PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Area, AreaChart
} from 'recharts';

type TreeNode = {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  child_count: number;
};

type FileInfo = {
  name: string;
  path: string;
  size: number;
  ext: string;
};

type DiskStats = {
  root_path: string;
  total_size: number;
  file_count: number;
  folder_count: number;
  children: TreeNode[];
  largest_files: FileInfo[];
  file_types: Record<string, number>;
  disk_total_space: number;
  disk_free_space: number;
};

type ProgressEvent = {
  current_path: string;
  files_scanned: number;
  folders_scanned: number;
  current_size: number;
};

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

const formatBytes = (bytes: number, decimals = 1) => {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// Fake history data for the Storage Activity chart
const generateFakeActivityData = (totalSize: number) => {
  const data = [];
  let current = totalSize * 0.8; // start at 80% of current
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({
      name: d.toLocaleDateString(undefined, { weekday: 'short' }),
      size: current
    });
    // Random fluctuation ending up at totalSize
    current += (totalSize - current) * Math.random();
  }
  data[data.length - 1].size = totalSize;
  return data;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<DiskStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('scandisk-theme') || 'dark');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [fileFilter, setFileFilter] = useState<string | null>(null);
  
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  
  const [recentScans, setRecentScans] = useState<{path: string, date: string, size: number}[]>(() => {
    try { return JSON.parse(localStorage.getItem('scandisk-recent') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('scandisk-theme', theme);
  }, [theme]);

  const selectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setHistory([]);
        scanFolder(selected as string);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const scanFolder = async (path: string, isBack = false) => {
    if (!isBack && currentPath) {
      setHistory(prev => [...prev, currentPath]);
    }
    
    setLoading(true);
    setProgress(null);
    setCurrentPath(path);
    
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<ProgressEvent>('scan-progress', (event) => {
        setProgress(event.payload);
      });
      const result: DiskStats = await invoke('scan_path', { path });
      setStats(result);
      
      // Save to recent scans
      const newRecent = [{path, date: new Date().toLocaleDateString(), size: result.total_size}, ...recentScans.filter(r => r.path !== path)].slice(0, 5);
      setRecentScans(newRecent);
      localStorage.setItem('scandisk-recent', JSON.stringify(newRecent));
      
    } catch (e) {
      console.error('Scan failed:', e);
      if (e !== 'Scan canceled by user') {
        alert(`Scan failed: ${e}`);
      }
      if (history.length > 0 && !isBack) {
        setCurrentPath(history[history.length - 1]);
        setHistory(prev => prev.slice(0, -1));
      } else if (history.length === 0) {
        setCurrentPath('');
      }
    } finally {
      if (unlisten) unlisten();
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_scan');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (confirm(`Are you sure you want to move this file to the trash?\n\n${filePath}`)) {
      try {
        await invoke('move_to_trash', { path: filePath });
        if (stats) {
          setStats({
            ...stats,
            largest_files: stats.largest_files.filter(f => f.path !== filePath)
          });
        }
      } catch (e) {
        alert(`Failed to move file to trash: ${e}`);
      }
    }
  };

  const handleSearch = async () => {
    if (!stats || !searchQuery) return;
    setIsSearching(true);
    try {
      const results = await invoke('search_files', { path: stats.root_path, query: searchQuery });
      setSearchResults(results as any[]);
    } catch (e) {
      alert(`Search failed: ${e}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleMoveSelectedTypes = async () => {
    if (!stats || selectedTypes.length === 0) return;
    try {
      const dest = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder'
      });
      if (dest) {
        setIsMoving(true);
        const movedCount: number = await invoke('move_files_by_extension', {
          path: stats.root_path,
          extensions: selectedTypes,
          destFolder: dest
        });
        alert(`Successfully moved ${movedCount} files to ${dest}`);
        setSelectedTypes([]);
        scanFolder(stats.root_path);
      }
    } catch (e) {
      alert(`Move failed: ${e}`);
    } finally {
      setIsMoving(false);
    }
  };

  const handleBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      scanFolder(prev, true);
    }
  };

  // Derived Data
  const fileTypeData = stats ? Object.entries(stats.file_types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value })) : [];

  const treeMapData = stats?.children?.map(c => ({
    name: c.name,
    size: c.size,
    path: c.path,
    is_dir: c.is_dir,
  })) || [];

  const cleanupFiles = stats?.largest_files?.filter(f => ['tmp', 'log', 'cache', 'bak', 'dmg', 'iso', 'old'].includes(f.ext)) || [];
  const cleanupSize = cleanupFiles.reduce((acc, f) => acc + f.size, 0);
  
  const largestFolder = stats?.children?.filter(c => c.is_dir).sort((a,b) => b.size - a.size)[0];
  const largestFile = stats?.largest_files?.[0];
  
  const activityData = stats ? generateFakeActivityData(stats.total_size) : [];

  const diskUsed = stats ? (stats.disk_total_space - stats.disk_free_space) : 0;
  const diskTotal = stats ? stats.disk_total_space : 1;
  const diskUsedPercent = Math.round((diskUsed / diskTotal) * 100) || 0;
  
  const donutData = [
    { name: 'Used', value: diskUsed },
    { name: 'Free', value: stats?.disk_free_space || 1 }
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand">
          <HardDrive size={24} className="brand-icon" />
          Scandisk
        </div>
        <div className="nav-menu">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={18} /> Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'folders' ? 'active' : ''}`} onClick={() => setActiveTab('folders')}>
            <Folder size={18} /> Folders
          </div>
          <div className={`nav-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
            <File size={18} /> Largest Files
          </div>
          <div className={`nav-item ${activeTab === 'types' ? 'active' : ''}`} onClick={() => setActiveTab('types')}>
            <PieChartIcon size={18} /> File Types
          </div>
          <div className={`nav-item ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>
            <Search size={18} /> Search
          </div>
          <div className={`nav-item ${activeTab === 'cleanup' ? 'active' : ''}`} onClick={() => setActiveTab('cleanup')}>
            <Brush size={18} /> Cleanup
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="topbar">
          <div className="breadcrumb">
            {history.length > 0 && (
              <button className="btn" style={{ padding: '6px', marginRight: '12px', background: 'transparent', border: 'none' }} onClick={handleBack}>
                <ArrowLeft size={18} />
              </button>
            )}
            <Home size={16} />
            <span className="breadcrumb-separator"><ChevronRight size={14} /></span>
            {currentPath ? (
              <span className="breadcrumb-item" title={currentPath}>
                {currentPath.length > 50 ? '...' + currentPath.slice(-50) : currentPath}
              </span>
            ) : (
              <span>Ready to scan</span>
            )}
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={selectFolder} disabled={loading}>
              <Search size={16} /> {loading ? 'Scanning...' : 'Scan Disk'}
            </button>
            <button className="btn" onClick={() => setShowSettings(true)}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        <div className="content-scroll">
          
          {/* Empty State */}
          {!stats && !loading && (
            <div className="animate-fade-in delay-1">
              <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '10px', letterSpacing: '-0.5px' }}>Analyze your storage.</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Get instant insights into what's consuming your disk space.</p>
              </div>
              
              <div className="recent-scans-row" style={{ marginBottom: '40px' }}>
                <div className="card card-interactive drive-card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} onClick={selectFolder}>
                  <div className="insight-icon primary" style={{ marginBottom: '20px', width: '48px', height: '48px' }}>
                    <Search size={24} />
                  </div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Select Folder or Drive</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Choose any directory to begin a deep scan.</p>
                </div>
                
                {recentScans.map((scan, i) => (
                  <div key={i} className="card card-interactive drive-card" style={{ cursor: 'pointer' }} onClick={() => scanFolder(scan.path)}>
                    <div className="drive-header">
                      <div className="drive-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={18} color="var(--primary)" /> Recent Scan
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{scan.date}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {scan.path}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatBytes(scan.size)}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Scanned</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="animate-fade-in" style={{ padding: '40px', maxWidth: '600px', margin: '60px auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <Activity size={48} color="var(--primary)" style={{ animation: 'pulse-bg 2s infinite' }} />
                <h2 style={{ marginTop: '20px', fontSize: '1.5rem' }}>Scanning Disk...</h2>
              </div>
              
              {progress ? (
                <div className="card">
                  <p style={{ fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '20px', fontSize: '0.85rem' }}>
                    {progress.current_path}
                  </p>
                  
                  <div className="progress-bar-bg" style={{ overflow: 'hidden', height: '6px', marginBottom: '24px' }}>
                    <div className="progress-bar-fill" style={{ width: '100%', animation: 'pulse-opacity 1.5s infinite' }}></div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Files</div>
                      <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>{progress.files_scanned.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Folders</div>
                      <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>{progress.folders_scanned.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Size</div>
                      <div style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--primary)' }}>{formatBytes(progress.current_size)}</div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '30px', textAlign: 'center' }}>
                    <button className="btn" onClick={handleCancel}>
                      Cancel Scan
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Warming up engine...</p>
              )}
            </div>
          )}

          {/* Dashboard Tab */}
          {stats && !loading && activeTab === 'dashboard' && (
            <div className="animate-fade-in delay-1">
              {/* Top Insights Row */}
              <div style={{ position: 'relative', marginBottom: '24px' }}>
                <button 
                  onClick={() => {
                    const el = document.getElementById('dashboard-scroll-container');
                    if (el) el.scrollBy({ left: -300, behavior: 'smooth' });
                  }} 
                  style={{ position: 'absolute', left: '-16px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)', boxShadow: 'var(--shadow-md)' }}
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div 
                  id="dashboard-scroll-container"
                  style={{ display: 'flex', overflowX: 'auto', gap: '24px', scrollBehavior: 'smooth', padding: '4px 0' }}
                  className="hide-scrollbar"
                >
                  
                  <div className="card insight-card" style={{ minWidth: '240px', flex: '0 0 auto' }}>
                    <div className="insight-header">
                      <div className="insight-icon primary"><Folder size={18} /></div>
                      Largest Folder
                    </div>
                    <div className="insight-value">{largestFolder ? formatBytes(largestFolder.size) : '0 B'}</div>
                    <div className="insight-subtext" title={largestFolder?.name}>{largestFolder?.name || '-'}</div>
                  </div>
                  
                  <div className="card insight-card" style={{ minWidth: '240px', flex: '0 0 auto' }}>
                    <div className="insight-header">
                      <div className="insight-icon warning"><File size={18} /></div>
                      Largest File
                    </div>
                    <div className="insight-value">{largestFile ? formatBytes(largestFile.size) : '0 B'}</div>
                    <div className="insight-subtext" title={largestFile?.name}>{largestFile?.name || '-'}</div>
                  </div>
                  
                  <div className="card insight-card" style={{ minWidth: '240px', flex: '0 0 auto' }}>
                    <div className="insight-header">
                      <div className="insight-icon success"><HardDriveUpload size={18} /></div>
                      Scanned Items
                    </div>
                    <div className="insight-value">{(stats.file_count + stats.folder_count).toLocaleString()}</div>
                    <div className="insight-subtext">{stats.file_count.toLocaleString()} files</div>
                  </div>
                  
                  <div className="card insight-card" style={{ minWidth: '240px', flex: '0 0 auto' }}>
                    <div className="insight-header">
                      <div className="insight-icon danger"><Trash2 size={18} /></div>
                      Potential Cleanup
                    </div>
                    <div className="insight-value">{formatBytes(cleanupSize)}</div>
                    <div className="insight-subtext">{cleanupFiles.length} files found</div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const el = document.getElementById('dashboard-scroll-container');
                    if (el) el.scrollBy({ left: 300, behavior: 'smooth' });
                  }} 
                  style={{ position: 'absolute', right: '-16px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)', boxShadow: 'var(--shadow-md)' }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Main Overview Row */}
              <div className="overview-row">
                {/* Radial Chart */}
                <div className="card chart-card" style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <h3 style={{ position: 'absolute', top: '24px', left: '24px', margin: 0 }}>Disk Overview</h3>
                  {stats.disk_total_space > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            <Cell fill="var(--primary)" />
                            <Cell fill="var(--border-color)" />
                          </Pie>
                          <RechartsTooltip formatter={(val: any) => formatBytes(Number(val) || 0)} contentStyle={{ borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 700 }}>{diskUsedPercent}%</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Used</div>
                      </div>
                      <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)' }}></div>
                          Used {formatBytes(diskUsed)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--border-color)' }}></div>
                          Free {formatBytes(stats.disk_free_space)}
                        </div>
                      </div>
                    </>
                  ) : (
                     <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>
                         {formatBytes(stats.total_size)}
                       </div>
                       <div style={{ color: 'var(--text-muted)' }}>Total Scanned</div>
                     </div>
                  )}
                </div>

                {/* Storage Breakdown Treemap */}
                <div className="card chart-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Storage Breakdown</h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Click to zoom in</span>
                  </div>
                  {treeMapData.length > 0 ? (
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={treeMapData}
                          dataKey="size"
                          aspectRatio={4 / 3}
                          stroke="var(--bg-card)"
                          fill="var(--primary)"
                          content={<CustomTreemapContent />}
                          onClick={(e: any) => {
                            if (e && e.is_dir && e.path) {
                              scanFolder(String(e.path));
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <RechartsTooltip content={<CustomTooltip />} />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No folders found</div>
                  )}
                </div>
              </div>

              {/* Bottom Row - Storage Activity */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Storage Activity (Simulated)</h3>
                <div style={{ height: '240px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatBytes(val, 0)} />
                      <RechartsTooltip 
                        formatter={(val: any) => formatBytes(Number(val))} 
                        contentStyle={{ borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }} 
                      />
                      <Area type="monotone" dataKey="size" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorSize)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Re-use tables for other tabs, styled beautifully */}
          {stats && !loading && activeTab === 'files' && (
            <div className="card animate-fade-in delay-1">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Largest Files</h3>
              {fileFilter && (
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    Filtering by .{fileFilter} 
                    <button onClick={() => setFileFilter(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>&times;</button>
                  </span>
                </div>
              )}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fileFilter ? stats.largest_files.filter(f => f.ext === fileFilter) : stats.largest_files).map((file, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{file.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }} title={file.path}>
                          {file.path.replace(stats.root_path, '').length > 40 
                            ? '...' + file.path.replace(stats.root_path, '').slice(-40) 
                            : file.path.replace(stats.root_path, '')}
                        </td>
                        <td><span style={{ 
                          padding: '4px 10px', 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          letterSpacing: '0.5px'
                        }}>{file.ext.toUpperCase()}</span></td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn" style={{ padding: '6px' }} onClick={() => shellOpen(file.path)} title="Open File">
                              <ExternalLink size={16} />
                            </button>
                            <button className="btn" style={{ padding: '6px' }} onClick={() => {
                              const parts = file.path.split(/[/\\]/);
                              parts.pop();
                              shellOpen(parts.join('/'));
                            }} title="Open Folder">
                              <FolderOpen size={16} />
                            </button>
                            <button className="btn" style={{ padding: '6px', color: 'var(--danger)' }} onClick={() => handleDeleteFile(file.path)} title="Move to Trash">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats && !loading && activeTab === 'folders' && (
            <div className="card animate-fade-in delay-1">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Folders in {stats.root_path}</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Items</th>
                      <th>Size</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.children.filter(c => c.is_dir).sort((a,b) => b.size - a.size).map((folder, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Folder size={18} color="var(--primary)" />
                            {folder.name}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{folder.child_count.toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(folder.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn" style={{ padding: '6px' }} onClick={() => scanFolder(folder.path)} title="Scan Folder">
                              <Search size={16} />
                            </button>
                            <button className="btn" style={{ padding: '6px' }} onClick={() => shellOpen(folder.path)} title="Open in OS">
                              <FolderOpen size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats && !loading && activeTab === 'types' && (
            <div className="card animate-fade-in delay-1">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>File Types Breakdown</h3>
                {selectedTypes.length > 0 && (
                  <button className="btn btn-primary" onClick={handleMoveSelectedTypes} disabled={isMoving}>
                    {isMoving ? 'Moving...' : `Move ${selectedTypes.length} Types to Folder`}
                  </button>
                )}
              </div>
              <div style={{ height: '300px', marginBottom: '30px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fileTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                      onClick={(data) => {
                        if (data && data.name) {
                          setFileFilter(data.name);
                          setActiveTab('files');
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {fileTypeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(val: any) => formatBytes(Number(val))} 
                      contentStyle={{ borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedTypes.length === Object.keys(stats.file_types).slice(0, 20).length && selectedTypes.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTypes(Object.entries(stats.file_types).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([ext]) => ext));
                            } else {
                              setSelectedTypes([]);
                            }
                          }}
                        />
                      </th>
                      <th>Extension</th>
                      <th style={{ textAlign: 'right' }}>Total Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.file_types)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 20)
                      .map(([ext, size], i) => (
                      <tr key={i}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedTypes.includes(ext)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTypes(prev => [...prev, ext]);
                              } else {
                                setSelectedTypes(prev => prev.filter(t => t !== ext));
                              }
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 500, textTransform: 'uppercase' }}>
                          <span style={{ 
                            padding: '4px 10px', 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            letterSpacing: '0.5px'
                          }}>{ext}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBytes(size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats && !loading && activeTab === 'search' && (
            <div className="card animate-fade-in delay-1">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Global Search</h3>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '30px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search for files by name..." 
                    style={{ 
                      width: '100%', 
                      padding: '12px 16px 12px 44px', 
                      borderRadius: 'var(--radius-sm)', 
                      border: '1px solid var(--border-color)', 
                      background: 'rgba(255,255,255,0.02)', 
                      color: 'var(--text-main)',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSearch} disabled={isSearching} style={{ padding: '0 24px' }}>
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {searchResults && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((file, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{file.name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }} title={file.path}>
                            {file.path.replace(stats.root_path, '').length > 40 ? '...' + file.path.replace(stats.root_path, '').slice(-40) : file.path.replace(stats.root_path, '')}
                          </td>
                          <td><span style={{ padding: '4px 10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>{file.ext.toUpperCase()}</span></td>
                          <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button className="btn" style={{ padding: '6px' }} onClick={() => shellOpen(file.path)}>
                                <ExternalLink size={16} />
                              </button>
                              <button className="btn" style={{ padding: '6px' }} onClick={() => {
                                const parts = file.path.split(/[/\\]/);
                                parts.pop();
                                shellOpen(parts.join('/'));
                              }}>
                                <FolderOpen size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {searchResults.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '40px 0' }}>No files found.</p>}
                </div>
              )}
            </div>
          )}

          {stats && !loading && activeTab === 'cleanup' && (
            <div className="card animate-fade-in delay-1">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div className="insight-icon danger"><AlertTriangle size={20} /></div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Recommended Cleanup</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Review large temporary or old files that are usually safe to delete.</p>
                </div>
              </div>
              
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Size</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cleanupFiles.map((file, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{file.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          {file.path.replace(stats.root_path, '').length > 40 ? '...' + file.path.replace(stats.root_path, '').slice(-40) : file.path.replace(stats.root_path, '')}
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn" style={{ padding: '6px 12px', color: 'white', background: 'var(--danger)', border: 'none' }} onClick={() => handleDeleteFile(file.path)}>
                            <Trash2 size={14} /> Move to Trash
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cleanupFiles.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No large temporary files found! You're clean.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="card modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Preferences</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>Theme</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className={`btn ${theme === 'light' ? 'btn-primary' : ''}`}
                  onClick={() => setTheme('light')}
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                >
                  <Sun size={18} /> Light Mode
                </button>
                <button 
                  className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`}
                  onClick={() => setTheme('dark')}
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                >
                  <Moon size={18} /> Dark Mode
                </button>
              </div>
            </div>
            
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Zap size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-main)' }}>Privacy First:</strong> Your data never leaves your device. Scandisk performs all processing locally without uploading any information.
                </p>
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => setShowSettings(false)} style={{ justifyContent: 'center', padding: '12px', marginTop: '10px' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom components for Treemap to look more premium
const CustomTreemapContent = (props: any) => {
  const { root, depth, x, y, width, height, index, payload, name } = props;
  const childrenLen = root?.children?.length || 1;
  const colorIndex = Math.floor((index / childrenLen) * 6) % CHART_COLORS.length;
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: depth < 2 ? CHART_COLORS[colorIndex] : '#ffffff11',
          stroke: 'var(--bg-card)',
          strokeWidth: 2,
          strokeOpacity: 0.8,
          rx: 4,
          ry: 4,
          transition: 'all 0.3s ease'
        }}
      />
      {width > 50 && height > 30 ? (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={500} fillOpacity={0.9}>
          {name}
        </text>
      ) : null}
      {width > 50 && height > 45 ? (
        <text x={x + 8} y={y + 34} fill="#fff" fontSize={10} fillOpacity={0.6}>
          {formatBytes(payload?.size || 0)}
        </text>
      ) : null}
    </g>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border-color)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        backdropFilter: 'blur(10px)'
      }}>
        <p style={{ fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-main)' }}>{data.name}</p>
        <p style={{ color: 'var(--primary)', margin: 0, fontWeight: 500 }}>{formatBytes(data.size)}</p>
        {data.is_dir && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0 0' }}>Click to zoom</p>}
      </div>
    );
  }
  return null;
};
