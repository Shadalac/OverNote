use base64::{engine::general_purpose, Engine as _};
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

// Reads an arbitrary image file the user picked (via the open dialog) and
// returns it as a "data:<mime>;base64,..." URL — a custom pet's "sticker"
// is stored as exactly this string, so it can go straight into an <img>
// src with no further plumbing.
#[tauri::command]
fn read_image_as_data_url(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
    {
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "gif" => "image/gif",
        Some(ext) if ext == "webp" => "image/webp",
        _ => "application/octet-stream",
    };
    let encoded = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backup_notes_db, read_image_as_data_url])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
