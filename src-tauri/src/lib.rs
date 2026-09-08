mod web_ota;

use tauri::{http, Manager, Url};
use web_ota::WebOtaStatus;

const DESKTOP_CONFIG_URLS: &[&str] = &[
  "https://monkeycards.app/desktop-config.json",
  "https://blinkywink.github.io/desktop-config.json",
  "https://raw.githubusercontent.com/blinkywink/blinkywink.github.io/main/public/desktop-config.json",
];

#[tauri::command]
fn fetch_desktop_config() -> Result<String, String> {
  let mut last = "Could not reach desktop-config.json".to_string();
  for url in DESKTOP_CONFIG_URLS {
    match ureq::get(*url).call() {
      Ok(resp) => return resp.into_string().map_err(|e| e.to_string()),
      Err(err) => last = err.to_string(),
    }
  }
  Err(last)
}

#[tauri::command]
fn desktop_web_ota_status(app: tauri::AppHandle) -> Result<Option<WebOtaStatus>, String> {
  web_ota::active_status(&app)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyArgs {
  url: String,
  checksum: String,
  version: String,
}

#[tauri::command]
fn desktop_web_ota_apply(app: tauri::AppHandle, args: ApplyArgs) -> Result<WebOtaStatus, String> {
  web_ota::apply_bundle(&app, &args.url, &args.checksum, &args.version)
}

#[tauri::command]
fn desktop_web_ota_reload(app: tauri::AppHandle) -> Result<(), String> {
  let Some(win) = app.get_webview_window("main") else {
    return Err("main window missing".into());
  };
  let url = Url::parse(web_ota::ota_entry_url()).map_err(|e| e.to_string())?;
  win.navigate(url).map_err(|e| e.to_string())
}

fn boot_ota_if_present(app: &tauri::AppHandle) {
  if !web_ota::should_boot_ota(app) {
    return;
  }
  let Some(win) = app.get_webview_window("main") else {
    return;
  };
  if let Ok(url) = Url::parse(web_ota::ota_entry_url()) {
    let _ = win.navigate(url);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .register_uri_scheme_protocol("mcota", |ctx, request| {
      let path = request.uri().path();
      match web_ota::resolve_bytes(ctx.app_handle(), path) {
        Some((bytes, mime)) => http::Response::builder()
          .status(http::StatusCode::OK)
          .header(http::header::CONTENT_TYPE, mime)
          .header(http::header::CACHE_CONTROL, "no-cache")
          .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
          .body(bytes)
          .unwrap_or_else(|_| {
            http::Response::builder()
              .status(http::StatusCode::INTERNAL_SERVER_ERROR)
              .body(Vec::new())
              .unwrap()
          }),
        None => http::Response::builder()
          .status(http::StatusCode::NOT_FOUND)
          .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
          .body(b"not found".to_vec())
          .unwrap(),
      }
    })
    .invoke_handler(tauri::generate_handler![
      fetch_desktop_config,
      desktop_web_ota_status,
      desktop_web_ota_apply,
      desktop_web_ota_reload,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_process::init())?;
      app.handle().plugin(tauri_plugin_opener::init())?;
      #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
      app
        .handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;
      boot_ota_if_present(app.handle());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
