use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{image::Image, Manager};

pub const TRAY_ID: &str = "localstacker";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TrayStatus {
    Up,
    Down,
    Unknown,
}

impl TrayStatus {
    pub fn from_label(s: &str) -> Self {
        match s {
            "up" => TrayStatus::Up,
            "down" => TrayStatus::Down,
            _ => TrayStatus::Unknown,
        }
    }
}

fn icon_bytes_for(status: TrayStatus) -> &'static [u8] {
    match status {
        TrayStatus::Up => include_bytes!("../icons/tray-up.png"),
        TrayStatus::Down => include_bytes!("../icons/tray-down.png"),
        TrayStatus::Unknown => include_bytes!("../icons/tray-unknown.png"),
    }
}

#[derive(Clone)]
pub struct TrayState {
    pub enabled: bool,
    pub status: TrayStatus,
    pub label: String,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            enabled: false,
            status: TrayStatus::Unknown,
            label: "Checking LocalStack…".to_string(),
        }
    }
}

fn build_menu(
    app: &tauri::AppHandle,
    state: &TrayState,
) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let status_item = MenuItem::with_id(app, "status", &state.label, false, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open", "Open LocalStacker", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit LocalStacker", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &status_item,
            &PredefinedMenuItem::separator(app)?,
            &open_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )
}

fn build_tray(app: &tauri::AppHandle, state: &TrayState) -> Result<(), String> {
    let img = Image::from_bytes(icon_bytes_for(state.status)).map_err(|e| e.to_string())?;
    let menu = build_menu(app, state).map_err(|e| e.to_string())?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(img)
        .icon_as_template(true)
        .tooltip(format!("LocalStacker — {}", state.label))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tray_set_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, parking_lot::Mutex<TrayState>>,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut current = state.lock();
        if current.enabled == enabled {
            return Ok(());
        }
        current.enabled = enabled;
    }
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    if enabled {
        let snapshot = state.lock().clone();
        build_tray(&app, &snapshot)
    } else {
        app.remove_tray_by_id(TRAY_ID);
        Ok(())
    }
}

#[tauri::command]
pub fn tray_set_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, parking_lot::Mutex<TrayState>>,
    status: String,
    label: String,
) -> Result<(), String> {
    let new_status = TrayStatus::from_label(&status);
    {
        let mut current = state.lock();
        current.status = new_status;
        current.label = label;
    }
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let img =
        tauri::image::Image::from_bytes(icon_bytes_for(new_status)).map_err(|e| e.to_string())?;
    tray.set_icon(Some(img)).map_err(|e| e.to_string())?;
    let snapshot = state.lock().clone();
    let menu = build_menu(&app, &snapshot).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(format!("LocalStacker — {}", snapshot.label)))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_label_maps_known_labels() {
        assert_eq!(TrayStatus::from_label("up"), TrayStatus::Up);
        assert_eq!(TrayStatus::from_label("down"), TrayStatus::Down);
    }

    #[test]
    fn from_label_clamps_unknown_to_unknown() {
        assert_eq!(TrayStatus::from_label("garbage"), TrayStatus::Unknown);
        assert_eq!(TrayStatus::from_label(""), TrayStatus::Unknown);
    }

    #[test]
    fn icon_bytes_are_distinct_per_status() {
        let up = icon_bytes_for(TrayStatus::Up);
        let down = icon_bytes_for(TrayStatus::Down);
        let unknown = icon_bytes_for(TrayStatus::Unknown);
        assert!(!up.is_empty());
        assert!(!down.is_empty());
        assert!(!unknown.is_empty());
        assert_ne!(up, down);
        assert_ne!(up, unknown);
        assert_ne!(down, unknown);
    }

    #[test]
    fn default_state_is_disabled_and_checking() {
        let state = TrayState::default();
        assert!(!state.enabled);
        assert_eq!(state.status, TrayStatus::Unknown);
        assert_eq!(state.label, "Checking LocalStack…");
    }
}
