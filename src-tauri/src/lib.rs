const DESKTOP_CONFIG_URLS: &[&str] = &[
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![fetch_desktop_config])
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
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
