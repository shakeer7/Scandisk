pub mod scanner;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

struct ScanState {
    cancel_flag: Arc<AtomicBool>,
}

#[tauri::command]
async fn scan_path(app: tauri::AppHandle, state: tauri::State<'_, ScanState>, path: String) -> Result<scanner::DiskStats, String> {
    state.cancel_flag.store(false, Ordering::Relaxed);
    let cancel_flag = state.cancel_flag.clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(app, &path, cancel_flag)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cancel_scan(state: tauri::State<'_, ScanState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
async fn search_files(path: String, query: String) -> Result<Vec<scanner::FileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scanner::search_directory(&path, &query)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Failed to move to trash: {}", e))
}

#[tauri::command]
async fn move_files_by_extension(path: String, extensions: Vec<String>, dest_folder: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scanner::move_files_by_extension(&path, extensions, &dest_folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![scan_path, move_to_trash, cancel_scan, search_files, move_files_by_extension])
    .setup(|app| {
      app.manage(ScanState {
          cancel_flag: Arc::new(AtomicBool::new(false)),
      });
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
