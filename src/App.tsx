import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { 
  HardDrive, Settings, Search, Trash2, Home, Folder, 
  File, LayoutDashboard, PieChart as PieChartIcon, Sun, Moon,
  ChevronRight, ArrowLeft, ExternalLink, FolderOpen, Brush
} from 'lucide-react';
import { Treemap, PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

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

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<DiskStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('disklens-theme') || 'light');
  const [style, setStyle] = useState(localStorage.getItem('disklens-style') || 'material');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [fileFilter, setFileFilter] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-style', style);
    localStorage.setItem('disklens-theme', theme);
    localStorage.setItem('disklens-style', style);
  }, [theme, style]);

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
    } catch (e) {
      console.error('Scan failed:', e);
      if (e !== 'Scan canceled by user') {
        alert(`Scan failed: ${e}`);
      }
      // Revert if failed or canceled
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
        // Optimistically remove from list
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

  const handleBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      scanFolder(prev, true);
    }
  };

  const fileTypeData = stats ? Object.entries(stats.file_types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value })) : [];

  const treeMapData = stats?.children.map(c => ({
    name: c.name,
    size: c.size,
    path: c.path,
    is_dir: c.is_dir,
  })) || [];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand">
          <HardDrive size={24} />
          Disklens
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
              <button className="btn" style={{ padding: '4px', marginRight: '8px' }} onClick={handleBack}>
                <ArrowLeft size={16} />
              </button>
            )}
            <Home size={16} />
            <span className="breadcrumb-separator"><ChevronRight size={14} /></span>
            {currentPath ? (
              <span className="breadcrumb-item" title={currentPath}>
                {currentPath.length > 50 ? '...' + currentPath.slice(-50) : currentPath}
              </span>
            ) : (
              <span>Select a disk to begin</span>
            )}
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={selectFolder} disabled={loading}>
              {loading ? 'Scanning...' : 'Scan Disk'}
            </button>
            <button className="btn" onClick={() => setShowSettings(true)}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        <div className="content-scroll">
          {!stats && !loading && (
            <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-muted)' }}>
              <HardDrive size={64} style={{ opacity: 0.2, marginBottom: '20px' }} />
              <h2>Welcome to Disklens</h2>
              <p>Select a disk or folder to analyze your storage usage.</p>
              <button className="btn btn-primary" style={{ margin: '20px auto' }} onClick={selectFolder}>
                Choose Folder
              </button>
            </div>
          )}

          {loading && (
            <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
              <h2>Scanning...</h2>
              {progress ? (
                <>
                  <div className="card" style={{ marginTop: '20px' }}>
                    <p style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '15px' }}>
                      {progress.current_path}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Files scanned</div>
                        <div style={{ fontWeight: 600 }}>{progress.files_scanned.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Folders scanned</div>
                        <div style={{ fontWeight: 600 }}>{progress.folders_scanned.toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Scanned size</div>
                      <div style={{ fontWeight: 600, fontSize: '1.2rem' }}>{formatBytes(progress.current_size)}</div>
                    </div>
                    <div className="progress-bar-bg" style={{ overflow: 'hidden' }}>
                      <div className="progress-bar-fill" style={{ width: '100%', animation: 'pulse-opacity 1.5s infinite' }}></div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button className="btn" style={{ background: 'var(--surface-color)', color: 'var(--text-color)' }} onClick={handleCancel}>
                      Cancel Scan
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>Starting scan engine...</p>
              )}
            </div>
          )}

          {stats && !loading && activeTab === 'dashboard' && (
            <>
              {stats.disk_total_space > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{currentPath}</div>
                    <div style={{ fontWeight: 600 }}>
                      {Math.round(((stats.disk_total_space - stats.disk_free_space) / stats.disk_total_space) * 100)}% Used
                    </div>
                  </div>
                  <div className="progress-bar-bg" style={{ height: '24px', borderRadius: '12px', marginBottom: '15px' }}>
                    <div className="progress-bar-fill" style={{ width: `${((stats.disk_total_space - stats.disk_free_space) / stats.disk_total_space) * 100}%` }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Used:</span> {formatBytes(stats.disk_total_space - stats.disk_free_space)}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Free:</span> {formatBytes(stats.disk_free_space)}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Total:</span> {formatBytes(stats.disk_total_space)}</div>
                  </div>
                </div>
              )}

              <div className="dashboard-grid">
                <div className="card stat-card">
                  <div className="stat-title">Folder Size</div>
                  <div className="stat-value">{formatBytes(stats.total_size)}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-title">Files</div>
                  <div className="stat-value">{stats.file_count.toLocaleString()}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-title">Folders</div>
                  <div className="stat-value">{stats.folder_count.toLocaleString()}</div>
                </div>
              </div>

              <div className="charts-row">
                <div className="card chart-card">
                  <h3>Storage Map</h3>
                  {treeMapData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <Treemap
                        data={treeMapData}
                        dataKey="size"
                        aspectRatio={4 / 3}
                        stroke="var(--bg-app)"
                        fill="var(--primary)"
                        onClick={(e: any) => {
                          // Drill down on click
                          if (e && e.is_dir && e.path) {
                            scanFolder(String(e.path));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <RechartsTooltip formatter={(value: any) => formatBytes(Number(value) || 0)} />
                      </Treemap>
                    </ResponsiveContainer>
                  ) : (
                    <p>No data</p>
                  )}
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                    Click on a folder rectangle to scan inside it.
                  </p>
                </div>
                <div className="card chart-card">
                  <h3>Top File Types</h3>
                  {fileTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={fileTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {fileTypeData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value: any) => formatBytes(Number(value) || 0)} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p>No data</p>
                  )}
                </div>
              </div>
            </>
          )}

          {stats && !loading && activeTab === 'files' && (
            <div className="card">
              <h3>Largest Files</h3>
              {fileFilter && (
                <div style={{ marginBottom: '15px' }}>
                  <span style={{ background: 'var(--primary)', color: 'white', padding: '4px 12px', borderRadius: '15px', fontSize: '0.9rem' }}>
                    Filtering by .{fileFilter} 
                    <button onClick={() => setFileFilter(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginLeft: '8px' }}>&times;</button>
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
                        <td style={{ color: 'var(--text-muted)' }} title={file.path}>
                          {file.path.replace(stats.root_path, '').length > 40 
                            ? '...' + file.path.replace(stats.root_path, '').slice(-40) 
                            : file.path.replace(stats.root_path, '')}
                        </td>
                        <td><span style={{ 
                          padding: '2px 8px', 
                          background: 'var(--border-color)', 
                          borderRadius: '12px',
                          fontSize: '0.8rem'
                        }}>{file.ext.toUpperCase()}</span></td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => shellOpen(file.path)} title="Open File">
                              <ExternalLink size={14} />
                            </button>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => {
                              const parts = file.path.split(/[/\\]/);
                              parts.pop();
                              shellOpen(parts.join('/'));
                            }} title="Open Folder">
                              <FolderOpen size={14} />
                            </button>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => handleDeleteFile(file.path)} title="Move to Trash">
                              <Trash2 size={14} />
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
            <div className="card">
              <h3>Folders</h3>
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
                    {stats.children.filter(c => c.is_dir).map((folder, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Folder size={16} style={{ color: 'var(--primary)' }} />
                            {folder.name}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{folder.child_count.toLocaleString()}</td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(folder.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => scanFolder(folder.path)} title="Scan Folder">
                              <Search size={14} />
                            </button>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => shellOpen(folder.path)} title="Open in OS">
                              <FolderOpen size={14} />
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
            <div className="card">
              <h3>File Types Breakdown</h3>
              <div style={{ height: '300px', marginBottom: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fileTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(data) => {
                        if (data && data.name) {
                          setFileFilter(data.name);
                          setActiveTab('files');
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {fileTypeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={`hsl(${(index * 360) / 8}, 70%, 50%)`} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => formatBytes(Number(val) || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Extension</th>
                      <th>Total Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.file_types)
                      .sort((a, b) => b[1] - a[1])
                      .map(([ext, size], i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500, textTransform: 'uppercase' }}>{ext}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBytes(size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats && !loading && activeTab === 'search' && (
            <div className="card">
              <h3>Global Search</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search for files by name..." 
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button className="btn btn-primary" onClick={handleSearch} disabled={isSearching}>
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
                          <td style={{ color: 'var(--text-muted)' }} title={file.path}>
                            {file.path.replace(stats.root_path, '').length > 40 ? '...' + file.path.replace(stats.root_path, '').slice(-40) : file.path.replace(stats.root_path, '')}
                          </td>
                          <td><span style={{ padding: '2px 8px', background: 'var(--border-color)', borderRadius: '12px', fontSize: '0.8rem' }}>{file.ext.toUpperCase()}</span></td>
                          <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => shellOpen(file.path)} title="Open File">
                                <ExternalLink size={14} />
                              </button>
                              <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => {
                                const parts = file.path.split(/[/\\]/);
                                parts.pop();
                                shellOpen(parts.join('/'));
                              }} title="Open Folder">
                                <FolderOpen size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {searchResults.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>No files found.</p>}
                </div>
              )}
            </div>
          )}

          {stats && !loading && activeTab === 'cleanup' && (
            <div className="card">
              <h3>Recommended Cleanup</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>These are large temporary, cache, or old files that are usually safe to delete.</p>
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
                    {stats.largest_files.filter(f => ['tmp', 'log', 'cache', 'bak', 'dmg', 'iso', 'old'].includes(f.ext)).map((file, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{file.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {file.path.replace(stats.root_path, '').length > 40 ? '...' + file.path.replace(stats.root_path, '').slice(-40) : file.path.replace(stats.root_path, '')}
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatBytes(file.size)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => handleDeleteFile(file.path)} title="Move to Trash">
                            <Trash2 size={14} /> Move to Trash
                          </button>
                        </td>
                      </tr>
                    ))}
                    {stats.largest_files.filter(f => ['tmp', 'log', 'cache', 'bak', 'dmg', 'iso', 'old'].includes(f.ext)).length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No large temporary files found.</td></tr>
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
            <h2>Settings</h2>
            
            <div className="settings-group">
              <label>Appearance Style</label>
              <select value={style} onChange={e => setStyle(e.target.value)}>
                <option value="material">Material Design (Clean)</option>
                <option value="glass">Glassmorphism (Modern)</option>
                <option value="neumorphic">Neumorphic (Soft)</option>
              </select>
            </div>

            <div className="settings-group">
              <label>Theme Mode</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className={`btn ${theme === 'light' ? 'btn-primary' : ''}`}
                  onClick={() => setTheme('light')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Sun size={16} /> Light
                </button>
                <button 
                  className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`}
                  onClick={() => setTheme('dark')}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  <Moon size={16} /> Dark
                </button>
              </div>
            </div>
            
            <div style={{ marginTop: '10px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Your data stays on your device. Disklens does not upload your files, filenames, or disk information anywhere.
              </p>
            </div>

            <button className="btn btn-primary" onClick={() => setShowSettings(false)} style={{ marginTop: '10px', justifyContent: 'center' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
