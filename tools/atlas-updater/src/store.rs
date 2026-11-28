// The helper's own files: the offline engine, the language packs, and the bindings of browser extensions.
//
// They live in the user's data folder, not in the extension folder, so updating the extension never removes them.

use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;

const DATA_FOLDER: &str = "AtlasTranslation";

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// The data folder: %LOCALAPPDATA% on Windows, ~/Library/Application Support on macOS, ~/.local/share on Linux.
pub fn data_dir() -> PathBuf {
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(local).join(DATA_FOLDER);
        }
    } else if cfg!(target_os = "macos") {
        if let Some(home) = home_dir() {
            return home.join("Library").join("Application Support").join(DATA_FOLDER);
        }
    } else {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
            return PathBuf::from(xdg).join(DATA_FOLDER);
        }
        if let Some(home) = home_dir() {
            return home.join(".local").join("share").join(DATA_FOLDER);
        }
    }
    std::env::temp_dir().join(DATA_FOLDER)
}

/// The folder with one sub-folder per language pair (for example enfr).
pub fn packs_dir() -> PathBuf {
    data_dir().join("packs")
}

/// The read-aloud voices the helper installed (one folder per voice).
pub fn voices_dir() -> PathBuf {
    data_dir().join("voices")
}

/// The engine program that the helper installed itself.
pub fn installed_engine() -> PathBuf {
    data_dir().join("engine").join(engine_file_name())
}

pub fn engine_file_name() -> &'static str {
    if cfg!(windows) {
        "atlas-engine.exe"
    } else {
        "atlas-engine"
    }
}

/// A random string of 64 hex characters. It comes from the operating system's random source where there is one, and
/// otherwise from std hashers, which are seeded from the operating system.
pub fn new_token() -> String {
    if let Some(bytes) = os_random(32) {
        return bytes.iter().map(|b| format!("{:02x}", b)).collect();
    }
    let mut out = String::new();
    for i in 0..4u64 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(i);
        out.push_str(&format!("{:016x}", hasher.finish()));
    }
    out
}

/// Bytes from the operating system's random source. None when it cannot be read (Windows, for example).
fn os_random(count: usize) -> Option<Vec<u8>> {
    use std::io::Read;
    let mut file = fs::File::open("/dev/urandom").ok()?;
    let mut buffer = vec![0u8; count];
    file.read_exact(&mut buffer).ok()?;
    Some(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_engine_name_matches_the_platform() {
        if cfg!(windows) {
            assert_eq!(engine_file_name(), "atlas-engine.exe");
        } else {
            assert_eq!(engine_file_name(), "atlas-engine");
        }
    }

    #[test]
    fn tokens_are_64_hex_characters() {
        let token = new_token();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(token, new_token());
    }

    #[test]
    fn the_data_folder_is_named_for_the_program() {
        assert!(data_dir().ends_with(DATA_FOLDER));
        assert!(packs_dir().ends_with("packs"));
    }
}
