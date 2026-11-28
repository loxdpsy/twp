//! Reading aloud. The sherpa-onnx runtime (the shared-library release of k2-fsa/sherpa-onnx v2.0.3, checked with its
//! GitHub SHA-256 digest) turns text into a WAV file with a voice the user installed, and this module plays that file
//! on this computer. A voice this module is not set up for (for example Kitten nano, whose flags are not confirmed yet)
//! is refused rather than guessed.
//!
//! Not yet wired to the window or the local API; the next step adds the call from api.rs.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::Ordering;

use crate::autostart;
use crate::json;
use crate::sha256;
use crate::transfer::Transfer;
use crate::voices::{self, Voice};

/// The release the runtime comes from. Only archives under this address are downloaded.
const RELEASE: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.3/";
/// Written in the runtime folder when the archive has been checked and unpacked.
const MARKER: &str = "installed.json";
/// The longest text sent in one call. Longer text is split by the caller.
const MAX_CHARS: usize = 2000;

/// One runtime archive: its file name, its size, and the SHA-256 GitHub publishes for it.
pub struct Runtime {
    pub file: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}

// The full shared-library archive for each platform. It includes the sherpa-onnx-offline-tts program and its libraries.
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub const RUNTIME: Option<Runtime> = Some(Runtime {
    file: "sherpa-onnx-v2.0.3-linux-x64-shared.tar.bz2",
    bytes: 29_936_514,
    sha256: "615b1bf0140bf09051c15fde6579e48543696352ebd477217d2e69b49d9aec13",
});
#[cfg(target_os = "macos")]
pub const RUNTIME: Option<Runtime> = Some(Runtime {
    file: "sherpa-onnx-v2.0.3-osx-universal2-shared.tar.bz2",
    bytes: 46_933_788,
    sha256: "563e084981190996f3f5620000b1c62447182ff01ff39dea1158df9dc4fd229c",
});
#[cfg(all(windows, target_arch = "x86_64"))]
pub const RUNTIME: Option<Runtime> = Some(Runtime {
    file: "sherpa-onnx-v2.0.3-win-x64-shared-MD-Release.tar.bz2",
    bytes: 27_162_680,
    sha256: "dd1eea0b1f88733aefebd8397412b7f17d00fa1d44140f4c69d11f060c0156d5",
});
#[cfg(not(any(
    all(target_os = "linux", target_arch = "x86_64"),
    target_os = "macos",
    all(windows, target_arch = "x86_64")
)))]
pub const RUNTIME: Option<Runtime> = None;

/// The kinds of voice this module knows how to run. The kind comes from the voice's id in voices.json.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Supertonic,
    Kokoro,
    Vits,
}

/// The kind of a voice, or an error that says it is not set up for reading aloud yet.
pub fn kind_of(voice: &Voice) -> Result<Kind, String> {
    if voice.id.starts_with("supertonic") {
        Ok(Kind::Supertonic)
    } else if voice.id.starts_with("kokoro") {
        Ok(Kind::Kokoro)
    } else if voice.id.starts_with("piper-") {
        Ok(Kind::Vits)
    } else {
        Err(format!("{} cannot read aloud yet", voice.name))
    }
}

/// The speaking speed for a reading-speed choice (normal, slow or slowest), as the extension names them.
pub fn speed_for(choice: &str) -> f32 {
    match choice {
        "slow" => 0.8,
        "slowest" => 0.6,
        _ => 1.0,
    }
}

/// The folder of the runtime inside the helper's data folder.
pub fn runtime_root(root: &Path) -> PathBuf {
    root.join("runtime")
}

/// True when the runtime is installed and its program can be found.
pub fn runtime_installed(root: &Path) -> bool {
    runtime_root(root).join(MARKER).is_file() && binary(root).is_some()
}

/// The text-to-speech program inside the installed runtime. It is found by name, so the folder layout of the archive
/// does not matter.
pub fn binary(root: &Path) -> Option<PathBuf> {
    let name = if cfg!(windows) { "sherpa-onnx-offline-tts.exe" } else { "sherpa-onnx-offline-tts" };
    find_file(&runtime_root(root), name, 4)
}

fn find_file(dir: &Path, name: &str, depth: u32) -> Option<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return None };
    let entries: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    for path in &entries {
        if path.is_file() && path.file_name() == Some(std::ffi::OsStr::new(name)) {
            return Some(path.clone());
        }
    }
    if depth == 0 {
        return None;
    }
    for path in &entries {
        if path.is_dir() {
            if let Some(found) = find_file(path, name, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

/// Downloads the runtime, checks its size and SHA-256, and unpacks it. Nothing is left in place when a check fails.
pub fn install_runtime(root: &Path, transfer: &Transfer) -> Result<(), String> {
    let runtime = RUNTIME.ok_or("the read-aloud runtime is not available for this computer")?;
    let url = format!("{}{}", RELEASE, runtime.file);
    fs::create_dir_all(root).map_err(|e| format!("cannot create {}: {}", root.display(), e))?;
    transfer.progress.total.store(runtime.bytes, Ordering::Relaxed);
    let _ = fs::remove_file(runtime_root(root).join(MARKER));

    let archive = root.join(format!("{}.part", runtime.file));
    if let Err(e) = transfer.download(&url, &archive, Some(runtime.bytes)) {
        let _ = fs::remove_file(&archive);
        return Err(format!("{} could not be downloaded: {}", runtime.file, e));
    }
    let bytes = fs::read(&archive).map_err(|e| format!("cannot read {}: {}", archive.display(), e))?;
    let _ = fs::remove_file(&archive);
    if bytes.len() as u64 != runtime.bytes {
        return Err(format!(
            "{} is {} bytes, expected {}. Nothing was installed.",
            runtime.file,
            bytes.len(),
            runtime.bytes
        ));
    }
    if sha256::hex(&bytes) != runtime.sha256 {
        return Err(format!("the SHA-256 check of {} failed. Nothing was installed.", runtime.file));
    }

    let work = root.join("runtime.unpacking");
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("cannot create {}: {}", work.display(), e))?;
    voices::unpack(&bytes, &work)?;
    let dir = runtime_root(root);
    voices::settle(&work, &dir)?;
    if binary(root).is_none() {
        return Err("the runtime archive has no sherpa-onnx-offline-tts program".to_string());
    }
    let marker = format!("{{\"file\":{},\"sha256\":{}}}\n", json::quote(runtime.file), json::quote(runtime.sha256));
    fs::write(dir.join(MARKER), marker).map_err(|e| format!("cannot finish the runtime install: {}", e))
}

/// The file in `dir` whose name ends with `suffix`, when there is exactly one.
fn only_with_suffix(dir: &Path, suffix: &str) -> Result<PathBuf, String> {
    let mut found: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("cannot read {}: {}", dir.display(), e))?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.file_name().map(|n| n.to_string_lossy().ends_with(suffix)).unwrap_or(false))
        .collect();
    if found.len() == 1 {
        Ok(found.remove(0))
    } else {
        Err(format!("the voice folder should hold one *{} file, found {}", suffix, found.len()))
    }
}

/// A file or folder the voice needs, by its exact name.
fn named(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let path = dir.join(name);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("the voice is missing {}", name))
    }
}

/// The arguments for the text-to-speech program: the voice's model files, the speed, the output file, and the text.
/// Each kind of voice has its own model flags (confirmed against sherpa-onnx v2.0.3's option names).
pub fn speak_args(voice_dir: &Path, voice: &Voice, text: &str, speed: f32, out: &Path) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = Vec::new();
    match kind_of(voice)? {
        Kind::Supertonic => {
            args.push(flag("supertonic-duration-predictor", &named(voice_dir, "duration_predictor.onnx")?));
            args.push(flag("supertonic-text-encoder", &named(voice_dir, "text_encoder.onnx")?));
            args.push(flag("supertonic-vector-estimator", &named(voice_dir, "vector_estimator.onnx")?));
            args.push(flag("supertonic-vocoder", &named(voice_dir, "vocoder.onnx")?));
            args.push(flag("supertonic-tts-json", &named(voice_dir, "tts.json")?));
            args.push(flag("supertonic-unicode-indexer", &named(voice_dir, "unicode_indexer.bin")?));
            args.push(flag("supertonic-voice-style", &named(voice_dir, "voice.bin")?));
        }
        Kind::Kokoro => {
            args.push(flag("kokoro-model", &named(voice_dir, "model.onnx")?));
            args.push(flag("kokoro-voices", &named(voice_dir, "voices.bin")?));
            args.push(flag("kokoro-tokens", &named(voice_dir, "tokens.txt")?));
            args.push(flag("kokoro-data-dir", &named(voice_dir, "espeak-ng-data")?));
        }
        Kind::Vits => {
            args.push(flag("vits-model", &only_with_suffix(voice_dir, ".onnx")?));
            args.push(flag("vits-tokens", &named(voice_dir, "tokens.txt")?));
            args.push(flag("vits-data-dir", &named(voice_dir, "espeak-ng-data")?));
        }
    }
    args.push(format!("--speed={}", speed));
    args.push("--sid=0".to_string());
    args.push(format!("--output-filename={}", out.display()));
    // A text that starts with a dash would be read as an option, so a space is put in front of it.
    let text = text.trim();
    let text = if text.starts_with('-') { format!(" {}", text) } else { text.to_string() };
    args.push(text);
    Ok(args)
}

fn flag(name: &str, path: &Path) -> String {
    format!("--{}={}", name, path.display())
}

/// Makes the program's own libraries findable: the folder of the program and the lib folder beside it.
fn with_libraries(command: &mut Command, program: &Path) {
    let Some(dir) = program.parent() else { return };
    let lib = dir.parent().map(|p| p.join("lib")).unwrap_or_else(|| dir.join("lib"));
    let (var, sep) = if cfg!(windows) {
        ("PATH", ";")
    } else if cfg!(target_os = "macos") {
        ("DYLD_LIBRARY_PATH", ":")
    } else {
        ("LD_LIBRARY_PATH", ":")
    };
    let mut value = format!("{}{}{}", dir.display(), sep, lib.display());
    if let Some(old) = std::env::var_os(var) {
        value.push_str(sep);
        value.push_str(&old.to_string_lossy());
    }
    command.env(var, value);
}

/// Speaks `text` with an installed voice. Writes a WAV file in the helper's data folder and returns its path.
pub fn synthesize(root: &Path, voice: &Voice, text: &str, speed: f32) -> Result<PathBuf, String> {
    if text.trim().is_empty() {
        return Err("there is no text to read".to_string());
    }
    if text.chars().count() > MAX_CHARS {
        return Err(format!("the text is longer than {} characters", MAX_CHARS));
    }
    let voices_root = root.join("voices");
    if !voices::is_installed_in(&voices_root, voice) {
        return Err(format!("{} is not installed. Install it in the Offline tab.", voice.name));
    }
    let program = binary(root).ok_or("the read-aloud runtime is not installed")?;
    let speech = root.join("speech");
    fs::create_dir_all(&speech).map_err(|e| format!("cannot create {}: {}", speech.display(), e))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out = speech.join(format!("speech-{}.wav", stamp));
    let args = speak_args(&voices::voice_dir(&voices_root, voice), voice, text, speed, &out)?;

    let mut command = autostart::quiet(Command::new(&program));
    command.args(&args);
    with_libraries(&mut command, &program);
    let output = command.output().map_err(|e| format!("the voice program could not start: {}", e))?;
    if !output.status.success() {
        let last = String::from_utf8_lossy(&output.stderr).lines().last().unwrap_or("").to_string();
        return Err(format!("the voice could not speak: {}", last));
    }
    if !out.is_file() {
        return Err("the voice wrote no sound".to_string());
    }
    Ok(out)
}

/// Plays a WAV file on this computer. Windows plays it through winmm, macOS with afplay, Linux with paplay or aplay.
/// It returns when the sound has finished on Windows, and right after the player starts elsewhere.
pub fn play(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        return play_windows(path);
    }
    #[cfg(target_os = "macos")]
    {
        return start_player(&["afplay"], path);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return start_player(&["paplay", "aplay"], path);
    }
}

#[cfg(not(windows))]
fn start_player(programs: &[&str], path: &Path) -> Result<(), String> {
    for program in programs {
        let mut command = autostart::quiet(Command::new(program));
        command.arg(path);
        if command.spawn().is_ok() {
            return Ok(());
        }
    }
    Err("no sound player was found (on Linux, install pulseaudio-utils or alsa-utils)".to_string())
}

#[cfg(windows)]
fn play_windows(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "winmm")]
    extern "system" {
        fn PlaySoundW(name: *const u16, module: *const std::ffi::c_void, flags: u32) -> i32;
    }
    const SND_FILENAME: u32 = 0x0002_0000;
    const SND_NODEFAULT: u32 = 0x0002;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    // Synchronous: the buffer must stay alive while the sound plays, so the caller runs this on its own thread.
    let ok = unsafe { PlaySoundW(wide.as_ptr(), std::ptr::null(), SND_FILENAME | SND_NODEFAULT) };
    if ok != 0 {
        Ok(())
    } else {
        Err("the sound could not be played".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn voice(id: &str) -> Voice {
        Voice {
            id: id.to_string(),
            name: format!("Voice {}", id),
            languages: vec!["en".to_string()],
            file: "x.tar.bz2".to_string(),
            url: format!("{}x.tar.bz2", RELEASE),
            bytes: 1,
            sha256: "0".repeat(64),
            licence: "MIT".to_string(),
            licence_url: "https://example.org".to_string(),
            accept_licence: false,
            default: false,
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("atlas-speak-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_kind_comes_from_the_voice_id() {
        assert_eq!(kind_of(&voice("supertonic-3")).unwrap(), Kind::Supertonic);
        assert_eq!(kind_of(&voice("kokoro-v1.1-zh-int8")).unwrap(), Kind::Kokoro);
        assert_eq!(kind_of(&voice("piper-john-us")).unwrap(), Kind::Vits);
        assert!(kind_of(&voice("kitten-nano-en-v0_2")).is_err(), "Kitten is refused until its flags are confirmed");
    }

    #[test]
    fn the_reading_speeds_map_to_rates() {
        assert_eq!(speed_for("normal"), 1.0);
        assert_eq!(speed_for("slow"), 0.8);
        assert_eq!(speed_for("slowest"), 0.6);
        assert_eq!(speed_for("anything else"), 1.0);
    }

    #[test]
    fn supertonic_gets_its_seven_files_by_name() {
        let dir = scratch("supertonic");
        for name in ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx", "tts.json", "unicode_indexer.bin", "voice.bin"] {
            fs::write(dir.join(name), b"x").unwrap();
        }
        let out = dir.join("out.wav");
        let args = speak_args(&dir, &voice("supertonic-3"), "Bonjour", 1.0, &out).unwrap();
        assert!(args.iter().any(|a| a.starts_with("--supertonic-voice-style=")));
        assert!(args.contains(&"--speed=1".to_string()));
        assert!(args.contains(&format!("--output-filename={}", out.display())));
        assert_eq!(args.last().unwrap(), "Bonjour");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_model_file_is_named() {
        let dir = scratch("missing");
        let err = speak_args(&dir, &voice("supertonic-3"), "hi", 1.0, &dir.join("o.wav")).unwrap_err();
        assert!(err.contains("duration_predictor.onnx"), "{}", err);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_piper_voice_takes_its_one_onnx_file_and_tokens() {
        let dir = scratch("piper");
        fs::write(dir.join("en_US-john-medium.onnx"), b"x").unwrap();
        fs::write(dir.join("tokens.txt"), b"x").unwrap();
        fs::create_dir_all(dir.join("espeak-ng-data")).unwrap();
        let args = speak_args(&dir, &voice("piper-john-us"), "Hello", 0.8, &dir.join("o.wav")).unwrap();
        assert!(args.iter().any(|a| a.starts_with("--vits-model=") && a.ends_with("en_US-john-medium.onnx")));
        assert!(args.contains(&"--speed=0.8".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_text_that_starts_with_a_dash_is_not_read_as_an_option() {
        let dir = scratch("dash");
        fs::write(dir.join("en_US-joe-medium.onnx"), b"x").unwrap();
        fs::write(dir.join("tokens.txt"), b"x").unwrap();
        fs::create_dir_all(dir.join("espeak-ng-data")).unwrap();
        let args = speak_args(&dir, &voice("piper-joe-us"), "--help", 1.0, &dir.join("o.wav")).unwrap();
        assert_eq!(args.last().unwrap(), " --help");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_program_is_found_inside_the_runtime_folder() {
        let root = scratch("find");
        let name = if cfg!(windows) { "sherpa-onnx-offline-tts.exe" } else { "sherpa-onnx-offline-tts" };
        let bin = root.join("runtime").join("sherpa-onnx-v2.0.3-linux-x64-shared").join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join(name), b"x").unwrap();
        assert_eq!(binary(&root), Some(bin.join(name)));
        assert!(!runtime_installed(&root), "no marker yet");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_runtime_comes_only_from_the_sherpa_release() {
        if let Some(runtime) = RUNTIME {
            assert!(runtime.file.starts_with("sherpa-onnx-v2.0.3-"));
            assert_eq!(runtime.sha256.len(), 64);
            assert!(runtime.sha256.chars().all(|c| c.is_ascii_hexdigit()));
            assert!(runtime.bytes > 1_000_000);
        }
    }

    #[test]
    fn empty_or_very_long_text_is_refused_before_anything_runs() {
        let root = scratch("refuse");
        let v = voice("supertonic-3");
        assert!(synthesize(&root, &v, "   ", 1.0).unwrap_err().contains("no text"));
        let long = "a".repeat(MAX_CHARS + 1);
        assert!(synthesize(&root, &v, &long, 1.0).unwrap_err().contains("longer"));
        let _ = fs::remove_dir_all(&root);
    }
}
