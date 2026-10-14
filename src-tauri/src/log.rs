use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

fn log_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("failed to resolve home directory: {error}"))?;

    #[cfg(target_os = "macos")]
    {
        return Ok(home.join("Library").join("Logs").join("chat.yeying.pub"));
    }

    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Local"));
        return Ok(base.join("chat.yeying.pub").join("logs"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var_os("XDG_STATE_HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".local").join("state"));
        return Ok(base.join("chat.yeying.pub").join("logs"));
    }
}

#[tauri::command]
pub fn append_log(app: tauri::AppHandle, message: String) -> Result<String, String> {
    let directory = log_directory(&app)?;
    create_dir_all(&directory)
        .map_err(|error| format!("failed to create app log directory: {error}"))?;
    let path = directory.join("chat.log");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("failed to open app log: {error}"))?;
    writeln!(file, "[{timestamp}] {message}")
        .map_err(|error| format!("failed to write app log: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}
