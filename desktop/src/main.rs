#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
struct FileData {
    path: String,
    name: String,
    content: String,
    size: u64,
}

fn expand(input: &str) -> PathBuf {
    let s = input.trim().strip_prefix("file://").unwrap_or(input.trim());
    if let Some(rest) = s.strip_prefix('~') {
        if rest.is_empty() || rest.starts_with('/') {
            if let Some(home) = std::env::var_os("HOME") {
                return PathBuf::from(home).join(rest.trim_start_matches('/'));
            }
        }
    }
    PathBuf::from(s)
}

#[tauri::command]
fn read_file(path: String) -> Result<FileData, String> {
    let raw = expand(&path);
    let abs = fs::canonicalize(&raw).map_err(|e| format!("{}: {}", raw.display(), e))?;
    let bytes = fs::read(&abs).map_err(|e| format!("{}: {}", abs.display(), e))?;
    Ok(FileData {
        name: abs
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size: bytes.len() as u64,
        path: abs.to_string_lossy().into_owned(),
        content: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(expand(&path), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image(dir: String, src: String) -> Result<String, String> {
    let target = {
        let p = expand(&src);
        if p.is_absolute() {
            p
        } else {
            PathBuf::from(&dir).join(p)
        }
    };
    let abs = fs::canonicalize(&target).map_err(|e| format!("{}: {}", target.display(), e))?;
    let bytes = fs::read(&abs).map_err(|e| e.to_string())?;
    let mime = match abs
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args().nth(1).filter(|a| !a.starts_with('-'))
}

#[tauri::command]
fn pick_file(app: tauri::AppHandle) {
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("テキストファイル", &["md", "markdown", "csv", "txt"])
        .pick_file(move |picked| {
            if let Some(path) = picked {
                let _ = handle.emit("hanami://open", path.to_string());
            }
        });
}

fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history.json"))
}

#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = history_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(_) => Ok(Vec::new()),
    }
}

#[tauri::command]
fn save_history(app: tauri::AppHandle, entries: Vec<serde_json::Value>) -> Result<(), String> {
    let path = history_path(&app)?;
    let text = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

fn main() {
    // WebKitGTK の DMA-BUF レンダラは一部の Wayland 環境で GDK をプロトコルエラーで
    // 落とすため、明示指定がなければ無効化してから GTK を初期化する。
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            read_image,
            initial_file,
            pick_file,
            load_history,
            save_history
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Hanami")
                .inner_size(1280.0, 860.0)
                .initialization_script(include_str!("local.js"))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Hanami の起動に失敗しました");
}
