//! Slim web OTA for desktop — same JS/CSS zip as Capgo mobile.
//! Art/music fall through to the baked `frontendDist` asset resolver.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{copy, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const STATE_FILE: &str = "state.json";
const CURRENT_DIR: &str = "current";
const STAGING_DIR: &str = "staging";
const ZIP_NAME: &str = "bundle.zip";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebOtaStatus {
  pub version: String,
  pub checksum: String,
}

#[derive(Debug, serde::Deserialize, Serialize)]
struct StateFile {
  version: String,
  checksum: String,
}

fn ota_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_local_data_dir()
    .map_err(|e| format!("app data dir: {e}"))?;
  Ok(base.join("web-ota"))
}

fn current_dir(root: &Path) -> PathBuf {
  root.join(CURRENT_DIR)
}

fn state_path(root: &Path) -> PathBuf {
  root.join(STATE_FILE)
}

fn read_state(root: &Path) -> Option<StateFile> {
  let raw = fs::read_to_string(state_path(root)).ok()?;
  serde_json::from_str(&raw).ok()
}

fn write_state(root: &Path, state: &StateFile) -> Result<(), String> {
  fs::create_dir_all(root).map_err(|e| e.to_string())?;
  let tmp = root.join("state.json.tmp");
  fs::write(
    &tmp,
    serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?,
  )
  .map_err(|e| e.to_string())?;
  fs::rename(&tmp, state_path(root)).map_err(|e| e.to_string())
}

pub fn active_status<R: Runtime>(app: &AppHandle<R>) -> Result<Option<WebOtaStatus>, String> {
  let root = ota_root(app)?;
  let Some(state) = read_state(&root) else {
    return Ok(None);
  };
  let index = current_dir(&root).join("index.html");
  if !index.is_file() {
    return Ok(None);
  }
  Ok(Some(WebOtaStatus {
    version: state.version,
    checksum: state.checksum,
  }))
}

fn url_allowed(url: &str) -> bool {
  let lower = url.to_ascii_lowercase();
  if !lower.contains("monkeycards-web") || !lower.ends_with(".zip") {
    return false;
  }
  lower.starts_with("https://api.blinkywink.co/")
    || lower.starts_with("https://github.com/blinkywink/")
    || lower.starts_with("https://release-assets.githubusercontent.com/")
    || lower.starts_with("https://objects.githubusercontent.com/")
}

fn sha256_file(path: &Path) -> Result<String, String> {
  let mut file = File::open(path).map_err(|e| e.to_string())?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 64 * 1024];
  loop {
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    if n == 0 {
      break;
    }
    hasher.update(&buf[..n]);
  }
  Ok(format!("{:x}", hasher.finalize()))
}

fn download_to(url: &str, dest: &Path) -> Result<(), String> {
  if !url_allowed(url) {
    return Err("OTA url not allowed".into());
  }
  let resp = ureq::get(url)
    .set("User-Agent", "MonkeyCards-Desktop-OTA")
    .call()
    .map_err(|e| e.to_string())?;
  if !(200..300).contains(&resp.status()) {
    return Err(format!("OTA download HTTP {}", resp.status()));
  }
  if let Some(parent) = dest.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut reader = resp.into_reader();
  let mut file = File::create(dest).map_err(|e| e.to_string())?;
  copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
  file.flush().map_err(|e| e.to_string())?;
  Ok(())
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
  if dest.exists() {
    fs::remove_dir_all(dest).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(dest).map_err(|e| e.to_string())?;

  let file = File::open(zip_path).map_err(|e| e.to_string())?;
  let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
  let dest_canon = dest
    .canonicalize()
    .map_err(|e| format!("canonicalize dest: {e}"))?;

  for i in 0..archive.len() {
    let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
    let Some(rel) = entry.enclosed_name() else {
      continue;
    };
    let out_path = dest.join(rel);
    let parent = out_path.parent().unwrap_or(dest);
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    if entry.is_dir() {
      fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
      continue;
    }

    let out_canon_parent = parent
      .canonicalize()
      .map_err(|e| format!("canonicalize parent: {e}"))?;
    if !out_canon_parent.starts_with(&dest_canon) {
      return Err("zip entry escaped destination".into());
    }

    let mut outfile = File::create(&out_path).map_err(|e| e.to_string())?;
    copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
  }

  if !dest.join("index.html").is_file() {
    return Err("OTA zip missing index.html".into());
  }
  Ok(())
}

pub fn apply_bundle<R: Runtime>(
  app: &AppHandle<R>,
  url: &str,
  checksum: &str,
  version: &str,
) -> Result<WebOtaStatus, String> {
  let want = checksum.trim().to_ascii_lowercase();
  if !want.chars().all(|c| c.is_ascii_hexdigit()) || want.len() != 64 {
    return Err("invalid checksum".into());
  }
  let ver = version.trim();
  if ver.is_empty() || ver.len() > 80 {
    return Err("invalid version".into());
  }

  let root = ota_root(app)?;
  let staging = root.join(STAGING_DIR);
  let zip_path = root.join(ZIP_NAME);
  let current = current_dir(&root);

  if staging.exists() {
    fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(&root).map_err(|e| e.to_string())?;

  download_to(url, &zip_path)?;
  let got = sha256_file(&zip_path)?;
  if got != want {
    let _ = fs::remove_file(&zip_path);
    return Err(format!("checksum mismatch (got {got})"));
  }

  extract_zip(&zip_path, &staging)?;

  let backup = root.join("previous");
  if backup.exists() {
    let _ = fs::remove_dir_all(&backup);
  }
  if current.exists() {
    fs::rename(&current, &backup).map_err(|e| e.to_string())?;
  }
  fs::rename(&staging, &current).map_err(|e| e.to_string())?;
  let _ = fs::remove_dir_all(&backup);
  let _ = fs::remove_file(&zip_path);

  let state = StateFile {
    version: ver.to_string(),
    checksum: want.clone(),
  };
  write_state(&root, &state)?;

  Ok(WebOtaStatus {
    version: state.version,
    checksum: state.checksum,
  })
}

fn normalize_request_path(request_path: &str) -> String {
  let mut rel = request_path.trim_start_matches('/').to_string();
  if let Some((path, _)) = rel.split_once('?') {
    rel = path.to_string();
  }
  if rel.is_empty() || rel == "." {
    return "index.html".into();
  }
  rel
}

fn resolve_ota_disk_file(current: &Path, rel: &str) -> Option<PathBuf> {
  if rel.contains("..") {
    return None;
  }
  let path = current.join(rel);
  let current_canon = current.canonicalize().ok()?;
  let path_canon = path.canonicalize().ok()?;
  if !path_canon.starts_with(&current_canon) || !path_canon.is_file() {
    return None;
  }
  Some(path_canon)
}

pub fn mime_for(path: &Path) -> &'static str {
  match path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_ascii_lowercase()
    .as_str()
  {
    "html" | "htm" => "text/html; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "json" => "application/json",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "ttf" => "font/ttf",
    "mp3" => "audio/mpeg",
    "ogg" => "audio/ogg",
    "wav" => "audio/wav",
    "txt" | "map" => "text/plain; charset=utf-8",
    _ => "application/octet-stream",
  }
}

/// Resolve a request path to bytes: OTA disk first, then baked frontendDist.
pub fn resolve_bytes<R: Runtime>(
  app: &AppHandle<R>,
  request_path: &str,
) -> Option<(Vec<u8>, String)> {
  let rel = normalize_request_path(request_path);
  if let Ok(root) = ota_root(app) {
    let current = current_dir(&root);
    if current.join("index.html").is_file() {
      if let Some(path) = resolve_ota_disk_file(&current, &rel) {
        if let Ok(bytes) = fs::read(&path) {
          return Some((bytes, mime_for(&path).to_string()));
        }
      }
      // SPA fallback for client routes under the OTA origin.
      let looks_like_file = Path::new(&rel).extension().is_some();
      if !looks_like_file {
        let index = current.join("index.html");
        if let Ok(bytes) = fs::read(&index) {
          return Some((bytes, mime_for(&index).to_string()));
        }
      }
    }
  }

  let asset_path = if rel.starts_with('/') {
    rel.clone()
  } else {
    format!("/{rel}")
  };
  let asset = app.asset_resolver().get(asset_path)?;
  Some((asset.bytes, asset.mime_type))
}

/// HTTP localhost origin so WKWebView can sign in. `mcota://` makes fetch
/// fail with "TypeError: Load failed" on macOS.
pub fn ota_entry_url() -> &'static str {
  "http://mcota.localhost/"
}

pub fn should_boot_ota<R: Runtime>(app: &AppHandle<R>) -> bool {
  active_status(app).ok().flatten().is_some()
}
