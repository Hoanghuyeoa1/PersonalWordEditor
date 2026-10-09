#[tauri::command]
fn read_document_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_document_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(path: String, content: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn get_app_recovery_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_data = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let recovery_dir = app_data.join("recovery");
    std::fs::create_dir_all(&recovery_dir).map_err(|e| e.to_string())?;
    recovery_dir.to_str().map(|s| s.to_string()).ok_or_else(|| "Invalid recovery path".to_string())
}

#[tauri::command]
fn write_atomic_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;
    let target = std::path::Path::new(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp_path = format!("{}.tmp.{}", path, std::process::id());
    let mut file = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    // Atomic rename with fallback remove_file on Windows if target already exists
    std::fs::rename(&temp_path, &path).or_else(|_| {
        let _ = std::fs::remove_file(&path);
        std::fs::rename(&temp_path, &path)
    }).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        e.to_string()
    })
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        if p.is_dir() {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn list_files_in_dir(dir_path: String) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&dir_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_file() {
            if let Some(s) = entry.path().to_str() {
                result.push(s.to_string());
            }
        }
    }
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_document_file,
            write_document_file,
            read_binary_file,
            write_binary_file,
            exit_app,
            get_app_recovery_dir,
            write_atomic_file,
            delete_file,
            list_files_in_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
