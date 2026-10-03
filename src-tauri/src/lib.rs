use tauri::Manager;

// Copies the live notes.db (from the app's own data directory) to wherever
// the user picked in the save dialog — the whole app's data in one file,
// since that's exactly what notes.db already is.
#[tauri::command]
fn backup_notes_db(app: tauri::AppHandle, dest: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let src = data_dir.join("notes.db");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backup_notes_db])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
