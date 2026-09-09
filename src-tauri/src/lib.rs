use std::collections::HashMap;

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
        .invoke_handler(tauri::generate_handler![greet, forward_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
