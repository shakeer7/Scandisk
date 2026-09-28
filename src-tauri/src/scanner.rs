use serde::{Deserialize, Serialize};
use std::collections::{HashMap, BinaryHeap};
use std::path::{Path, PathBuf};
use std::cmp::Ordering;
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiskStats {
    pub root_path: String,
    pub total_size: u64,
    pub file_count: u64,
    pub folder_count: u64,
    pub children: Vec<TreeNode>,
    pub largest_files: Vec<FileInfo>,
    pub file_types: HashMap<String, u64>,
    pub disk_total_space: u64,
    pub disk_free_space: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub child_count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Eq, PartialEq)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub ext: String,
}

#[derive(Eq, PartialEq)]
struct FileHeapNode(FileInfo);

impl Ord for FileHeapNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // Min-heap ordering to pop the smallest elements out when keeping the top N
        other.0.size.cmp(&self.0.size)
    }
}

impl PartialOrd for FileHeapNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Serialize)]
pub struct ProgressEvent {
    pub current_path: String,
    pub files_scanned: u64,
    pub folders_scanned: u64,
    pub current_size: u64,
}

pub fn scan_directory(app: AppHandle, path_str: &str, cancel_flag: Arc<AtomicBool>) -> Result<DiskStats, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path_str));
    }
    
    // Get real disk capacity
    let disks = Disks::new_with_refreshed_list();
    let mut disk_total_space = 0;
    let mut disk_free_space = 0;
    let mut max_match_len = 0;
    for disk in disks.list() {
        let mount = disk.mount_point();
        if path.starts_with(mount) {
            let mount_len = mount.as_os_str().len();
            if mount_len > max_match_len {
                max_match_len = mount_len;
                disk_total_space = disk.total_space();
                disk_free_space = disk.available_space();
            }
        }
    }

    let mut total_size = 0;
    let mut file_count = 0;
    let mut folder_count = 0;
    
    let mut children_sizes: HashMap<String, TreeNode> = HashMap::new();
    let mut file_types: HashMap<String, u64> = HashMap::new();
    let mut top_files: BinaryHeap<FileHeapNode> = BinaryHeap::new();
    
    let mut last_emit = std::time::Instant::now();

    for entry in jwalk::WalkDir::new(path).skip_hidden(false) {
        if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Scan canceled by user".to_string());
        }
        
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, 
        };
        
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        
        let entry_path = entry.path();
        if entry_path == path {
            continue;
        }
        
        if last_emit.elapsed().as_millis() > 100 {
            let _ = app.emit("scan-progress", ProgressEvent {
                current_path: entry_path.to_string_lossy().into_owned(),
                files_scanned: file_count,
                folders_scanned: folder_count,
                current_size: total_size,
            });
            last_emit = std::time::Instant::now();
        }

        let mut p = entry_path.as_path();
        let mut child_name = String::new();
        
        if p.parent() == Some(path) {
            child_name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
        } else {
            while let Some(parent) = p.parent() {
                if parent == path {
                    child_name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
                    break;
                }
                p = parent;
            }
        }
        
        if child_name.is_empty() { 
            continue; 
        }
        
        if metadata.is_dir() {
            folder_count += 1;
            let node = children_sizes.entry(child_name.clone()).or_insert(TreeNode {
                name: String::new(), 
                path: String::new(),
                size: 0,
                is_dir: true, 
                child_count: 0,
            });
            node.child_count += 1;
        } else {
            file_count += 1;
            let size = metadata.len();
            total_size += size;
            
            let node = children_sizes.entry(child_name.clone()).or_insert(TreeNode {
                name: String::new(),
                path: String::new(),
                size: 0,
                is_dir: false,
                child_count: 0,
            });
            node.size += size;
            node.child_count += 1;
            
            let ext = entry_path.extension().unwrap_or_default().to_string_lossy().to_string();
            let ext_key = if ext.is_empty() { "unknown".to_string() } else { ext.to_lowercase() };
            *file_types.entry(ext_key.clone()).or_insert(0) += size;
            
            let fi = FileInfo {
                name: entry_path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                path: entry_path.to_string_lossy().into_owned(),
                size,
                ext: ext_key,
            };
            
            top_files.push(FileHeapNode(fi));
            if top_files.len() > 100 {
                top_files.pop();
            }
        }
    }
    
    let mut children_vec = Vec::new();
    for (name, mut node) in children_sizes {
        let child_path = path.join(&name);
        node.name = name;
        node.path = child_path.to_string_lossy().into_owned();
        node.is_dir = child_path.is_dir();
        children_vec.push(node);
    }
    children_vec.sort_by(|a, b| b.size.cmp(&a.size));
    
    let mut largest_files = Vec::new();
    while let Some(node) = top_files.pop() {
        largest_files.push(node.0);
    }
    largest_files.reverse();

    Ok(DiskStats {
        root_path: path_str.to_string(),
        total_size,
        file_count,
        folder_count,
        children: children_vec,
        largest_files,
        file_types,
        disk_total_space,
        disk_free_space,
    })
}

pub fn search_directory(path_str: &str, query: &str) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path_str));
    }
    
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();
    
    for entry in jwalk::WalkDir::new(path).skip_hidden(false) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        
        if entry.file_type().is_dir() {
            continue;
        }
        
        let file_name = entry.file_name().to_string_lossy();
        if file_name.to_lowercase().contains(&query_lower) {
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            
            let ext = entry.path().extension().unwrap_or_default().to_string_lossy().to_string();
            let ext_key = if ext.is_empty() { "unknown".to_string() } else { ext.to_lowercase() };
            
            results.push(FileInfo {
                name: file_name.into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size: metadata.len(),
                ext: ext_key,
            });
            
            if results.len() >= 200 {
                break;
            }
        }
    }
    
    results.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(results)
}
