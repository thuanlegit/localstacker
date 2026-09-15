pub mod docker;
pub mod tray;

use std::collections::HashMap;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ForwardRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ForwardResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[tauri::command]
async fn forward_request(req: ForwardRequest) -> Result<ForwardResponse, String> {
    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut client_req = reqwest::Client::new().request(method, &req.url);

    for (k, v) in req.headers {
        // Strip Origin and Referer headers so LocalStack does not reject with 403 Forbidden
        if k.eq_ignore_ascii_case("origin") || k.eq_ignore_ascii_case("referer") {
            continue;
        }
        client_req = client_req.header(&k, &v);
    }

    if let Some(body) = req.body {
        client_req = client_req.body(body);
    }

    let resp = client_req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

    let mut headers = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(val_str) = v.to_str() {
            headers.insert(k.as_str().to_string(), val_str.to_string());
        }
    }

    let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    Ok(ForwardResponse {
        status,
        status_text,
        headers,
        body,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(docker::DockerSessions::default())
        .manage(parking_lot::Mutex::new(tray::TrayState::default()))
        .setup(|app| {
            if cfg!(target_os = "macos") {
                app.set_menu(tauri::menu::Menu::default(app.handle())?)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window
                    .app_handle()
                    .state::<parking_lot::Mutex<tray::TrayState>>();
                if state.lock().enabled {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            forward_request,
            docker::docker_status,
            docker::docker_list_containers,
            docker::docker_inspect_container,
            docker::docker_start_container,
            docker::docker_stop_container,
            docker::docker_restart_container,
            docker::docker_remove_container,
            docker::docker_create_container,
            docker::docker_cancel,
            docker::docker_container_logs,
            docker::docker_stop_logs,
            tray::tray_set_enabled,
            tray::tray_set_status,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
                if !has_visible_windows {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        });
}
