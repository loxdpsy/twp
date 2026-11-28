// atlas-updater: installs the newest Atlas Translation release into an unpacked copy of the extension.
//
// Chromium and Edge never update an unpacked copy (one loaded from the GitHub zip) by themselves. This tool does
// the work the browser cannot: it downloads the newest chromium zip from GitHub, checks it against GitHub's SHA-256,
// and copies it over the folder you point it at. Then you click "Reload extension" in the Updates section of Settings.
//
// Usage:
//   atlas-updater                 open the helper window and its tray icon (the browser picker, updates and install)
//   atlas-updater --serve         start the helper in the tray only; its window opens from the tray icon
//   atlas-updater [--check] <folder>
//     <folder>  the folder with manifest.json of the unpacked Atlas Translation
//     --check   only report whether a newer release exists
//
// It stores nothing and sends nothing except the request to api.github.com and the zip download from github.com.

// A release build of the Windows program is a GUI program: double-clicking it opens the Atlas Helper window and its tray
// icon, without a command prompt behind it. (Debug builds keep the console, so their messages still show.)
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod api;
mod autostart;
mod bind;
mod browsers;
mod engine;
mod enginelib;
mod gui;
mod i18n;
mod json;
mod native_host;
mod ocr;
mod packs;
mod settings;
mod speak;
mod sha256;
mod store;
mod tray;
mod transfer;
mod voices;

use std::fs;
use std::path::{Path, PathBuf};

use crate::transfer::Transfer;

// The release the helper installs from. While Atlas Translation publishes prereleases, that is the newest one in the list
// that is not a draft (GitHub lists releases newest first). /releases/latest skips prereleases, so it is used only when
// INCLUDE_PRERELEASES is false. Set it to false at launch, when the releases are no longer prereleases.
const RELEASES_API: &str = "https://api.github.com/repos/loxdpsy/AT/releases?per_page=10";
const LATEST_RELEASE_API: &str = "https://api.github.com/repos/loxdpsy/AT/releases/latest";
const INCLUDE_PRERELEASES: bool = true;
const EXTENSION_NAME: &str = "Atlas Translation";

struct Release {
    version: String,
    zip_name: String,
    zip_url: String,
    sha256_hex: String,
    /// The bullet lines of the version's CHANGELOG section (what is new in it). Empty when the notes have none.
    notes: Vec<String>,
}

/// The helper's version, the same as the extension's (for example 0.0.2.1). Cargo.toml stores it as 0.0.2+1,
/// because Cargo needs three numbers; the fourth part is build metadata. See scripts/sync-version.mjs.
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").replace('+', ".")
}

/// The releases page. A new helper is downloaded from its release (the helper cannot replace itself while it runs).
pub const RELEASES_PAGE: &str = "https://github.com/loxdpsy/AT/releases";

/// The helper's own update check. The helper and the extension share one version number, so the newest release is the
/// newest helper too. Returns the line to show when that release is newer than this helper, otherwise None.
pub fn helper_update_text(latest: &str) -> Option<String> {
    if is_newer(latest, &app_version()) {
        Some(format!("A new version is available, please update: Atlas Helper {}.", latest))
    } else {
        None
    }
}

fn main() {
    if let Err(message) = run() {
        eprintln!("Error: {}", message);
        std::process::exit(1);
    }
}

fn usage() -> String {
    "Usage: atlas-updater [--serve] | atlas-updater [--check] <folder>\n  no arguments  open the helper window and its tray icon\n  --serve       start the helper in the tray only (no window until you click its icon)\n  <folder>      the folder with manifest.json of the unpacked Atlas Translation\n  --check       only report whether a newer release exists".to_string()
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    // A browser started this program to connect its extension: start the helper in the tray and answer. No window.
    if native_host::is_launch(&args) {
        return native_host::run();
    }
    if args.is_empty() {
        // Started by a double click: the helper window and its tray icon open.
        return gui::run(true);
    }
    if args.iter().any(|a| a.as_str() == "--serve") {
        return gui::run(false);
    }
    let check_only = args.iter().any(|a| a.as_str() == "--check");
    let folder_args: Vec<&String> = args.iter().filter(|a| a.as_str() != "--check").collect();
    if folder_args.len() != 1 {
        return Err(usage());
    }
    let folder = PathBuf::from(folder_args[0]);

    let installed = read_installed_version(&folder)?;
    println!("Installed: {} {} in {}", EXTENSION_NAME, installed, folder.display());

    let release = fetch_latest_release()?;
    if let Some(text) = helper_update_text(&release.version) {
        println!("{}", text);
    }
    if !is_newer(&release.version, &installed) {
        println!("You have the latest version ({}). Nothing to install.", installed);
        return Ok(());
    }
    println!("Newer version available: {} (installed {}).", release.version, installed);
    if check_only {
        println!("Run without --check to install it.");
        return Ok(());
    }

    install(&folder, &release, &Transfer::quiet())?;
    println!("Installed {} in {}.", release.version, folder.display());
    println!("Next: open Atlas Translation's Settings in your browser, and click \"Reload extension\" in the Updates section.");
    Ok(())
}

/// The version from manifest.json, after checking that the folder is really Atlas Translation.
fn read_installed_version(folder: &Path) -> Result<String, String> {
    let manifest_path = folder.join("manifest.json");
    let text = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("cannot read {}: {}. Give the folder that holds manifest.json.", manifest_path.display(), e))?;
    let manifest = json::parse(&text).map_err(|e| format!("{} is not valid JSON: {}", manifest_path.display(), e))?;
    let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name != EXTENSION_NAME {
        return Err(format!(
            "{} is not the Atlas Translation folder (its manifest name is \"{}\"). Nothing was changed.",
            folder.display(),
            name
        ));
    }
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "manifest.json has no version".to_string())
}

/// The release that the helper installs from, as GitHub's JSON. See INCLUDE_PRERELEASES.
fn newest_release_json() -> Result<json::Value, String> {
    if !INCLUDE_PRERELEASES {
        let body = github_text(LATEST_RELEASE_API)?;
        return json::parse(&body).map_err(|e| format!("GitHub sent an unexpected answer: {}", e));
    }
    let body = github_text(RELEASES_API)?;
    let list = json::parse(&body).map_err(|e| format!("GitHub sent an unexpected answer: {}", e))?;
    let releases = list.as_array().ok_or("GitHub sent an unexpected answer: no release list")?;
    releases
        .iter()
        .find(|r| !matches!(r.get("draft"), Some(json::Value::Bool(true))))
        .cloned()
        .ok_or_else(|| "no release has been published yet".to_string())
}

fn fetch_latest_release() -> Result<Release, String> {
    let release = newest_release_json()?;

    let tag = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("the latest release has no tag_name")?;
    let version = tag.trim_start_matches(|c: char| c == 'v' || c == 'V').to_string();
    let zip_name = format!("atlas-translation-{}-chromium.zip", version);

    let assets = release
        .get("assets")
        .and_then(|v| v.as_array())
        .ok_or("the latest release has no assets")?;
    let asset = assets
        .iter()
        .find(|a| a.get("name").and_then(|v| v.as_str()) == Some(zip_name.as_str()))
        .ok_or_else(|| format!("release {} has no {}", version, zip_name))?;

    let zip_url = asset
        .get("browser_download_url")
        .and_then(|v| v.as_str())
        .ok_or("the zip has no download link")?
        .to_string();
    let digest = asset
        .get("digest")
        .and_then(|v| v.as_str())
        .ok_or("GitHub gives no SHA-256 for the zip, so it will not be installed")?;
    let sha256_hex = digest
        .strip_prefix("sha256:")
        .ok_or("the zip checksum is not SHA-256, so it will not be installed")?
        .to_lowercase();

    let notes = changelog_bullets(release.get("body").and_then(|v| v.as_str()).unwrap_or(""));
    Ok(Release { version, zip_name, zip_url, sha256_hex, notes })
}

/// The bullet lines of a release's notes. The notes are the CHANGELOG section of that version, so a bullet is one change.
/// A bullet can wrap onto indented lines. The list ends at the first heading: the release page adds its download list after it.
fn changelog_bullets(body: &str) -> Vec<String> {
    let mut bullets: Vec<String> = Vec::new();
    // True while the last bullet can still take wrapped lines.
    let mut open = false;
    for raw in body.lines() {
        let line = raw.trim_end();
        if line.starts_with('#') {
            break;
        }
        if let Some(text) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            bullets.push(text.trim().to_string());
            open = true;
        } else if open && raw.starts_with("  ") && !line.trim().is_empty() {
            if let Some(last) = bullets.last_mut() {
                last.push(' ');
                last.push_str(line.trim());
            }
        } else if !line.trim().is_empty() {
            open = false;
        }
    }
    bullets.retain(|b| !b.is_empty());
    bullets.truncate(30);
    bullets
}

/// True when version a is newer than version b. Compares the numeric parts, so 0.0.2.10 is newer than 0.0.2.9.
fn is_newer(a: &str, b: &str) -> bool {
    let x = version_parts(a);
    let y = version_parts(b);
    for i in 0..x.len().max(y.len()) {
        let p = x.get(i).copied().unwrap_or(0);
        let q = y.get(i).copied().unwrap_or(0);
        if p != q {
            return p > q;
        }
    }
    false
}

fn version_parts(v: &str) -> Vec<u64> {
    v.trim_start_matches(|c: char| c == 'v' || c == 'V')
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn install(folder: &Path, release: &Release, transfer: &Transfer) -> Result<(), String> {
    let work = std::env::temp_dir().join(format!("atlas-updater-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("cannot create {}: {}", work.display(), e))?;
    let result = install_from(folder, release, &work, transfer);
    // Remove the download and the unpacked files whether or not the install worked.
    let _ = fs::remove_dir_all(&work);
    result
}

fn install_from(folder: &Path, release: &Release, work: &Path, transfer: &Transfer) -> Result<(), String> {
    let zip_path = work.join(&release.zip_name);
    let unpacked = work.join("unpacked");

    println!("Downloading {} ...", release.zip_name);
    transfer.progress.set_stage("Downloading the extension...");
    transfer.download(&release.zip_url, &zip_path, None)?;

    transfer.progress.set_stage("Checking the download...");
    let bytes = fs::read(&zip_path).map_err(|e| format!("cannot read the download: {}", e))?;
    if sha256::hex(&bytes) != release.sha256_hex {
        return Err("the download does not match GitHub's SHA-256. Nothing was changed. Try again later.".to_string());
    }
    println!("Checksum OK.");

    transfer.progress.set_stage("Unpacking...");
    extract(&zip_path, &unpacked)?;
    let unpacked_version = read_installed_version(&unpacked)?;
    if unpacked_version != release.version {
        return Err(format!(
            "the zip holds version {}, but the release is {}. Nothing was changed.",
            unpacked_version, release.version
        ));
    }

    transfer.progress.set_stage("Copying the files into the folder...");
    copy_tree(&unpacked, folder)
}

/// GitHub allows 60 requests an hour per IP address without a token, and runners on shared networks can use that up.
/// When GITHUB_TOKEN is set (the install test in CI sets it), requests to api.github.com are sent with it, which allows far more.
fn github_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN").ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

fn http_text(url: &str) -> Result<String, String> {
    let mut request = ureq::get(url)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "atlas-updater")
        .timeout(std::time::Duration::from_secs(60));
    if url.starts_with("https://api.github.com/") {
        if let Some(token) = github_token() {
            request = request.set("Authorization", &format!("Bearer {}", token));
        }
    }
    let response = request.call().map_err(|e| format!("could not reach GitHub. {}", e))?;
    response.into_string().map_err(|e| format!("could not read GitHub's answer: {}", e))
}

/// http_text, tried again when GitHub does not answer (a 403 rate limit is not retried by the first attempt).
fn github_text(url: &str) -> Result<String, String> {
    const ATTEMPTS: u32 = 3;
    let mut last = String::new();
    for attempt in 1..=ATTEMPTS {
        match http_text(url) {
            Ok(body) => return Ok(body),
            Err(e) => last = e,
        }
        if attempt < ATTEMPTS {
            println!("GitHub did not answer. Trying again ({} of {}) ...", attempt + 1, ATTEMPTS);
            std::thread::sleep(std::time::Duration::from_secs(10));
        }
    }
    Err(last)
}

/// Unzips with the zip crate on every system. An entry that would land outside the folder is refused.
fn extract(zip_path: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("cannot create {}: {}", dest.display(), e))?;
    let file = fs::File::open(zip_path).map_err(|e| format!("cannot open the download: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("cannot read the download: {}", e))?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| format!("cannot read the download: {}", e))?;
        let relative = entry
            .enclosed_name()
            .map(|p| p.to_path_buf())
            .ok_or_else(|| "the download holds a file outside its folder. Nothing was changed.".to_string())?;
        let out = dest.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| format!("cannot create {}: {}", out.display(), e))?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
        }
        let mut writer = fs::File::create(&out).map_err(|e| format!("cannot write {}: {}", out.display(), e))?;
        std::io::copy(&mut entry, &mut writer).map_err(|e| format!("cannot unzip {}: {}", out.display(), e))?;
    }
    Ok(())
}

/// Copies every file from one folder tree into another, replacing files with the same name. Nothing is deleted.
fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    let entries = fs::read_dir(from).map_err(|e| format!("cannot read {}: {}", from.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("cannot read {}: {}", from.display(), e))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        let kind = entry.file_type().map_err(|e| format!("cannot read {}: {}", src.display(), e))?;
        if kind.is_dir() {
            fs::create_dir_all(&dst).map_err(|e| format!("cannot create {}: {}", dst.display(), e))?;
            copy_tree(&src, &dst)?;
        } else if kind.is_file() {
            fs::copy(&src, &dst).map_err(|e| format!("cannot write {}: {} (is the browser or another program using it?)", dst.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_update_text_only_when_the_release_is_newer() {
        assert!(helper_update_text("999.0.0.0").is_some());
        assert!(helper_update_text(&app_version()).is_none());
        assert!(helper_update_text("0.0.0.1").is_none());
    }

    #[test]
    fn reads_the_changelog_bullets_and_stops_at_the_download_list() {
        let body = "- First change.\n  continued here.\n* Second change.\n\nA paragraph.\n  not a continuation.\n\n## Downloads\n\n- **Chrome Web Store:** file.zip";
        assert_eq!(
            changelog_bullets(body),
            vec!["First change. continued here.".to_string(), "Second change.".to_string()]
        );
        assert!(changelog_bullets("").is_empty());
    }

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.0.2.1", "0.0.2.0"));
        assert!(is_newer("0.0.2.10", "0.0.2.9"));
        assert!(is_newer("v0.1.0.0", "0.0.9.9"));
        assert!(!is_newer("0.0.2.0", "0.0.2.0"));
        assert!(!is_newer("0.0.2.0", "0.0.2.1"));
    }

    #[test]
    fn version_parts_ignores_a_v_prefix() {
        assert_eq!(version_parts("v0.0.2.1"), vec![0, 0, 2, 1]);
    }
}
