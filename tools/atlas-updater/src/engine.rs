// The offline engine: runs atlas-engine (tools/atlas-engine) and translates texts through it.
//
// Each language pair runs up to MAX_PER_PAIR atlas-engine processes. A process starts the first time its pair is
// needed and is kept for later requests. Long texts are split into pieces, and the pieces run in parallel on those
// processes. At most MAX_RUNNING are kept. A process that fails or does not answer in time is stopped, and the next
// request starts it again.
//
// The protocol is one line per text, in base64, both ways (see atlas-engine.cpp).

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::sha256;
use crate::transfer::Transfer;
use crate::store;

/// Engine processes per language pair. Texts are split into pieces, and the pieces are translated in parallel by these.
const MAX_PER_PAIR: usize = 2;
/// Engine processes in all (each one holds a language pack in memory). Another pair is stopped to stay under this.
const MAX_RUNNING: usize = 4;
/// A text longer than this (in characters) is split at its line breaks into pieces of about this size.
const PIECE_LIMIT: usize = 600;
const READY_TIMEOUT: Duration = Duration::from_secs(120);
const REPLY_TIMEOUT: Duration = Duration::from_secs(60);
const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let v = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[((v >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((v >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { ALPHABET[((v >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[(v & 63) as usize] as char } else { '=' });
    }
    out
}

/// None when the input has a character that is not base64.
pub fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    for c in input.bytes() {
        if c == b'=' {
            break;
        }
        if c == b'\r' || c == b'\n' || c == b' ' {
            continue;
        }
        let value = ALPHABET.iter().position(|&a| a == c)? as u32;
        buffer = (buffer << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buffer >> bits) & 0xFF) as u8);
        }
    }
    Some(out)
}

/// The name of the engine program for this computer in a GitHub release. None when there is no engine for it.
pub fn engine_asset_name() -> Option<&'static str> {
    if cfg!(windows) {
        Some("atlas-engine-windows.exe")
    } else if cfg!(target_os = "macos") {
        Some("atlas-engine-macos")
    } else if cfg!(target_os = "linux") {
        Some("atlas-engine-linux")
    } else {
        None
    }
}

/// The engine library for this computer in a GitHub release (see enginelib.rs). None when there is no library for it.
pub fn library_asset_name() -> Option<&'static str> {
    if cfg!(windows) {
        Some("atlas-engine-lib-windows.dll")
    } else if cfg!(target_os = "macos") {
        Some("atlas-engine-lib-macos.dylib")
    } else if cfg!(target_os = "linux") {
        Some("atlas-engine-lib-linux.so")
    } else {
        None
    }
}

/// Downloads the engine for this computer from the latest release, checks it against the SHA-256 that GitHub gives for
/// the file, and installs it in the helper's data folder. The engine library (see enginelib.rs) is fetched the same way
/// when the release has one. Returns the release version.
pub fn install_from_latest_release(transfer: &Transfer) -> Result<String, String> {
    // On Windows the engine is part of the setup file and sits next to the helper. The helper never downloads a program
    // and runs it on Windows, so this only checks that the installed engine is there.
    if cfg!(windows) {
        return match find_binary() {
            Some(_) => Ok(env!("CARGO_PKG_VERSION").replace('+', ".")),
            None => Err("The offline engine is not in this copy of Atlas Helper. Install it with atlas-updater-windows-setup.exe, which includes the engine.".to_string()),
        };
    }
    let asset = engine_asset_name().ok_or("there is no offline engine for this computer")?;
    let release = super::newest_release_json()?;
    let tag = release.get("tag_name").and_then(|v| v.as_str()).ok_or("the latest release has no tag_name")?;
    let version = tag.trim_start_matches(|c: char| c == 'v' || c == 'V').to_string();
    let assets = release.get("assets").and_then(|v| v.as_array()).ok_or("the latest release has no assets")?;
    // The Linux and macOS packages carry the engine, so a release does not need a separate copy of it.
    if !assets.iter().any(|a| a.get("name").and_then(|v| v.as_str()) == Some(asset)) {
        return Err(format!(
            "This release has no separate offline engine ({}). Install Atlas Helper from the AppImage (Linux) or the DMG (macOS), which include the engine.",
            asset
        ));
    }
    let folder = store::data_dir().join("engine");
    fs::create_dir_all(&folder).map_err(|e| format!("cannot create {}: {}", folder.display(), e))?;

    let target = store::installed_engine();
    fetch_checked(assets, asset, &version, &target, "the offline engine", transfer)?;
    make_executable(&target)?;

    // The library is optional. A release without it still installs the program, which then does the translation.
    if let (Some(lib_asset), Some(lib_file)) = (library_asset_name(), crate::enginelib::library_file_name()) {
        let _ = fetch_checked(assets, lib_asset, &version, &folder.join(lib_file), "the engine library", transfer);
    }
    Ok(version)
}

/// Downloads one release asset, checks it against the SHA-256 that GitHub gives for it, and moves it to `target`.
/// Nothing is written to `target` unless the check passes.
fn fetch_checked(assets: &[crate::json::Value], asset: &str, version: &str, target: &Path, what: &str, transfer: &Transfer) -> Result<(), String> {
    let found = assets
        .iter()
        .find(|a| a.get("name").and_then(|v| v.as_str()) == Some(asset))
        .ok_or_else(|| format!("release {} has no {} yet. Try again after the next release.", version, asset))?;
    let url = found
        .get("browser_download_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("{} has no download link", what))?
        .to_string();
    let digest = found
        .get("digest")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("GitHub gives no SHA-256 for {}, so it will not be installed", what))?;
    let expected = digest
        .strip_prefix("sha256:")
        .ok_or_else(|| format!("the checksum of {} is not SHA-256, so it will not be installed", what))?
        .to_lowercase();

    let partial = target.with_extension("part");
    if let Err(e) = transfer.download(&url, &partial, None) {
        let _ = fs::remove_file(&partial);
        return Err(format!("{} could not be downloaded: {}", what, e));
    }
    let bytes = fs::read(&partial).map_err(|e| format!("cannot read {}: {}", partial.display(), e))?;
    if sha256::hex(&bytes) != expected {
        let _ = fs::remove_file(&partial);
        return Err(format!("the SHA-256 check of {} failed. Nothing was installed.", what));
    }
    let _ = fs::remove_file(target);
    fs::rename(&partial, target).map_err(|e| format!("cannot save {}: {}", target.display(), e))?;
    Ok(())
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("cannot make the engine runnable: {}", e))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// The engine program: the one next to the helper program (the installer puts it there), or the copy the helper
/// downloaded before (on macOS and Linux, and on Windows before the installer included the engine).
pub fn find_binary() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join(store::engine_file_name());
    if beside.is_file() {
        return Some(beside);
    }
    let installed = store::installed_engine();
    if installed.is_file() {
        return Some(installed);
    }
    None
}

struct Running {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<Result<String, String>>,
}

/// The engine processes of each language pair, in the order they were started.
pub struct Engine {
    running: Mutex<HashMap<String, Vec<Arc<Mutex<Running>>>>>,
}

/// Splits a text into pieces that are translated separately. The text is cut only at line breaks, and whole lines are
/// grouped into pieces of about PIECE_LIMIT characters. Joining the pieces with "\n" gives the text back exactly.
pub fn split_pieces(text: &str) -> Vec<String> {
    if text.chars().count() <= PIECE_LIMIT {
        return vec![text.to_string()];
    }
    let mut pieces = Vec::new();
    let mut group: Vec<&str> = Vec::new();
    let mut length = 0;
    for line in text.split('\n') {
        let size = line.chars().count();
        if !group.is_empty() && length + 1 + size > PIECE_LIMIT {
            pieces.push(group.join("\n"));
            group.clear();
            length = 0;
        }
        length += if group.is_empty() { size } else { size + 1 };
        group.push(line);
    }
    if !group.is_empty() {
        pieces.push(group.join("\n"));
    }
    pieces
}

impl Engine {
    pub fn new() -> Engine {
        Engine { running: Mutex::new(HashMap::new()) }
    }

    /// Translates the texts with the pack of one language pair. Returns one translation per text, in order.
    /// Long texts are split into pieces, the pieces run in parallel on up to MAX_PER_PAIR engine processes, and the
    /// pieces of each text are joined again.
    pub fn translate(&self, binary: &Path, pack_dir: &Path, pair: &str, texts: &[String]) -> Result<Vec<String>, String> {
        let mut pieces: Vec<String> = Vec::new();
        let mut counts: Vec<usize> = Vec::with_capacity(texts.len());
        for text in texts {
            let parts = split_pieces(text);
            counts.push(parts.len());
            pieces.extend(parts);
        }
        if pieces.is_empty() {
            return Ok(Vec::new());
        }
        let translated = self.translate_pieces(binary, pack_dir, pair, &pieces)?;
        let mut out = Vec::with_capacity(texts.len());
        let mut next = 0;
        for count in counts {
            out.push(translated[next..next + count].join("\n"));
            next += count;
        }
        Ok(out)
    }

    /// Stops every running engine process (called when the helper stops).
    pub fn stop_all(&self) {
        if let Ok(mut running) = self.running.lock() {
            for (_, processes) in running.drain() {
                for process in processes {
                    stop_shared(&process);
                }
            }
        }
    }

    fn translate_pieces(&self, binary: &Path, pack_dir: &Path, pair: &str, pieces: &[String]) -> Result<Vec<String>, String> {
        // The engine library, when it is installed and opens the pack: the pieces are translated in this process.
        if let Some(pack) = crate::enginelib::pack(pack_dir) {
            return pack.translate_all(pieces, MAX_PER_PAIR);
        }
        let workers = MAX_PER_PAIR.min(pieces.len()).max(1);
        let processes = self.processes_for(binary, pack_dir, pair, workers)?;
        let chunk = (pieces.len() + workers - 1) / workers;
        let results: Vec<Result<Vec<String>, String>> = thread::scope(|scope| {
            let handles: Vec<_> = pieces
                .chunks(chunk)
                .zip(processes.iter())
                .map(|(part, process)| {
                    scope.spawn(move || -> Result<Vec<String>, String> {
                        let mut guard = process.lock().map_err(|_| "the offline engine lock is broken".to_string())?;
                        exchange(&mut guard, part)
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap_or_else(|_| Err("the offline engine failed unexpectedly".to_string())))
                .collect()
        });
        let mut out = Vec::with_capacity(pieces.len());
        for result in results {
            match result {
                Ok(part) => out.extend(part),
                Err(e) => {
                    // A failed process is stopped and started again by the next request.
                    self.forget(pair);
                    return Err(e);
                }
            }
        }
        Ok(out)
    }

    /// The processes for a pair, starting them when needed. Keeps the total within MAX_RUNNING.
    fn processes_for(&self, binary: &Path, pack_dir: &Path, pair: &str, wanted: usize) -> Result<Vec<Arc<Mutex<Running>>>, String> {
        let mut running = self.running.lock().map_err(|_| "the offline engine lock is broken".to_string())?;
        let have = running.get(pair).map(|v| v.len()).unwrap_or(0);
        let needed = wanted.saturating_sub(have);
        loop {
            let total: usize = running.values().map(|v| v.len()).sum();
            if total + needed <= MAX_RUNNING {
                break;
            }
            let other = running.keys().find(|name| name.as_str() != pair).cloned();
            match other {
                Some(name) => {
                    if let Some(processes) = running.remove(&name) {
                        for process in processes {
                            stop_shared(&process);
                        }
                    }
                }
                None => break,
            }
        }
        while running.get(pair).map(|v| v.len()).unwrap_or(0) < wanted {
            let started = start(binary, pack_dir)?;
            running.entry(pair.to_string()).or_default().push(Arc::new(Mutex::new(started)));
        }
        let picked: Vec<Arc<Mutex<Running>>> = running.get(pair).map(|v| v.iter().take(wanted).cloned().collect()).unwrap_or_default();
        Ok(picked)
    }

    /// Stops and removes every process of a pair.
    fn forget(&self, pair: &str) {
        if let Ok(mut running) = self.running.lock() {
            if let Some(processes) = running.remove(pair) {
                for process in processes {
                    stop_shared(&process);
                }
            }
        }
    }
}

fn stop_shared(process: &Arc<Mutex<Running>>) {
    if let Ok(mut running) = process.lock() {
        stop(&mut running);
    }
}

fn start(binary: &Path, pack_dir: &Path) -> Result<Running, String> {
    let mut command = Command::new(binary);
    command.arg(pack_dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = crate::autostart::quiet(command)
        .spawn()
        .map_err(|e| format!("cannot start the offline engine ({}): {}", binary.display(), e))?;
    let stdin = child.stdin.take().ok_or("the offline engine has no input")?;
    let stdout = child.stdout.take().ok_or("the offline engine has no output")?;
    let (sender, lines) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(text) => {
                    if sender.send(Ok(text)).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = sender.send(Err(e.to_string()));
                    break;
                }
            }
        }
        // The end of the output closes the channel, which the reader sees as "stopped".
    });
    let mut running = Running { child, stdin, lines };
    match running.lines.recv_timeout(READY_TIMEOUT) {
        Ok(Ok(line)) if line == "ready" => Ok(running),
        Ok(Ok(line)) => {
            stop(&mut running);
            Err(format!("the offline engine did not start: {}", line))
        }
        Ok(Err(e)) => {
            stop(&mut running);
            Err(format!("the offline engine did not start: {}", e))
        }
        Err(_) => {
            stop(&mut running);
            Err("the offline engine did not say it was ready in time".to_string())
        }
    }
}

fn exchange(process: &mut Running, texts: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::with_capacity(texts.len());
    for text in texts {
        writeln!(process.stdin, "{}", base64_encode(text.as_bytes()))
            .and_then(|_| process.stdin.flush())
            .map_err(|e| format!("the offline engine stopped: {}", e))?;
        match process.lines.recv_timeout(REPLY_TIMEOUT) {
            Ok(Ok(line)) => {
                let bytes = base64_decode(&line).ok_or("the offline engine sent a bad reply")?;
                let translated = String::from_utf8(bytes).map_err(|_| "the offline engine sent text that is not UTF-8".to_string())?;
                out.push(translated);
            }
            Ok(Err(e)) => return Err(format!("the offline engine stopped: {}", e)),
            Err(RecvTimeoutError::Timeout) => return Err("the offline engine took too long to answer".to_string()),
            Err(RecvTimeoutError::Disconnected) => return Err("the offline engine stopped".to_string()),
        }
    }
    Ok(out)
}

fn stop(running: &mut Running) {
    let _ = running.child.kill();
    let _ = running.child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_examples() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_round_trips_any_text() {
        for text in ["", "Hello, world", "Bonjour\nle monde", "Čeština: žluťoučký kůň", "emoji 🙂 and tabs\t"] {
            let encoded = base64_encode(text.as_bytes());
            assert_eq!(base64_decode(&encoded).unwrap(), text.as_bytes());
        }
    }

    #[test]
    fn every_platform_has_an_engine_name_in_the_release() {
        let name = engine_asset_name().expect("a name for this computer");
        assert!(name.starts_with("atlas-engine-"));
    }

    #[test]
    fn base64_refuses_characters_outside_the_alphabet() {
        assert!(base64_decode("Zm9v!").is_none());
    }

    #[test]
    fn a_short_text_is_one_piece_and_a_long_one_joins_back_exactly() {
        assert_eq!(split_pieces("hello"), vec!["hello".to_string()]);
        let line = "word ".repeat(40);
        let text = (0..30).map(|i| format!("{} {}", i, line)).collect::<Vec<_>>().join("\n\n");
        let pieces = split_pieces(&text);
        assert!(pieces.len() > 1);
        assert!(pieces.iter().all(|p| p.chars().count() <= PIECE_LIMIT || !p.contains('\n')));
        assert_eq!(pieces.join("\n"), text);
    }

    #[cfg(unix)]
    #[test]
    fn an_engine_that_is_not_there_is_an_error_not_a_hang() {
        let engine = Engine::new();
        let result = engine.translate(Path::new("/nonexistent/atlas-engine"), Path::new("/tmp"), "enfr", &["hi".to_string()]);
        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_fake_engine_is_talked_to_line_by_line() {
        // A shell script that says "ready", then answers each line with the same line, in upper case.
        let dir = std::env::temp_dir().join(format!("atlas-engine-fake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("fake-engine.sh");
        std::fs::write(&script, "#!/bin/sh\necho ready\nwhile IFS= read -r line; do echo \"$line\"; done\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let engine = Engine::new();
        let texts = vec!["Hello".to_string(), "two\nlines".to_string(), String::new()];
        let out = engine.translate(&script, &dir, "enfr", &texts).expect("the fake engine answers");
        assert_eq!(out, texts);
        engine.stop_all();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
