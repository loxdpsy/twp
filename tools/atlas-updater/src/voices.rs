// Read-aloud voices: the choices in voices.json and the voices that speak one language. A voice is a sherpa-onnx
// archive (.tar.bz2) from the k2-fsa release. Unpacking an archive and the read-aloud window are not built yet. This
// module lists the choices, so an install can take "every voice for this language" as one job, with its total size.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use crate::json;
use crate::sha256;
use crate::transfer::Transfer;

const CATALOGUE_TEXT: &str = include_str!("voices.json");

/// Every voice download must come from this release. The helper refuses any other address.
const TRUSTED_PREFIX: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";

#[derive(Debug, Clone, PartialEq)]
pub struct Voice {
    pub id: String,
    pub name: String,
    /// Language codes the voice speaks, for example "en" or "ja".
    pub languages: Vec<String>,
    pub file: String,
    pub url: String,
    pub bytes: u64,
    /// The SHA-256 of the archive, in lowercase hex. The download is refused when it does not match.
    pub sha256: String,
    pub licence: String,
    pub licence_url: String,
    /// True when the licence has terms the user must accept before the download (for example use restrictions).
    pub accept_licence: bool,
    /// The voice used for its languages when the user has not chosen another.
    pub default: bool,
}

fn text(value: &json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("the voice catalogue has no \"{}\"", key))
}

fn number(value: &json::Value, key: &str) -> Result<u64, String> {
    match value.get(key) {
        Some(json::Value::Number(n)) if *n > 0.0 && n.fract() == 0.0 => Ok(*n as u64),
        _ => Err(format!("the voice catalogue has no positive number \"{}\"", key)),
    }
}

fn flag(value: &json::Value, key: &str) -> bool {
    matches!(value.get(key), Some(json::Value::Bool(true)))
}

/// Reads the voice list. A voice with a download from another address, or a checksum that is not 64 hex digits, is an error.
pub fn parse_catalogue(source: &str) -> Result<Vec<Voice>, String> {
    let root = json::parse(source)?;
    let items = root
        .get("voices")
        .and_then(|v| v.as_array())
        .ok_or("the voice catalogue has no \"voices\" list")?;
    let mut voices = Vec::new();
    for item in items {
        let id = text(item, "id")?;
        let languages: Vec<String> = item
            .get("languages")
            .and_then(|v| v.as_array())
            .ok_or_else(|| format!("voice {} has no \"languages\" list", id))?
            .iter()
            .filter_map(|l| l.as_str().map(|s| s.to_lowercase()))
            .collect();
        let url = text(item, "url")?;
        if !url.starts_with(TRUSTED_PREFIX) {
            return Err(format!("voice {} is not downloaded from the sherpa-onnx release", id));
        }
        let sha256 = text(item, "sha256")?;
        if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("voice {} has no SHA-256 checksum", id));
        }
        voices.push(Voice {
            name: text(item, "name")?,
            languages,
            file: text(item, "file")?,
            url,
            bytes: number(item, "bytes")?,
            sha256: sha256.to_lowercase(),
            licence: text(item, "licence")?,
            licence_url: text(item, "licenceUrl")?,
            accept_licence: flag(item, "acceptLicence"),
            default: flag(item, "default"),
            id,
        });
    }
    Ok(voices)
}

/// The built-in voice list (voices.json).
pub fn catalogue() -> Result<Vec<Voice>, String> {
    parse_catalogue(CATALOGUE_TEXT)
}

/// The voices that speak a language, the default first. A regional code matches its main language: "zh-CN" is "zh".
pub fn voices_for<'a>(voices: &'a [Voice], language: &str) -> Vec<&'a Voice> {
    let wanted = language.split('-').next().unwrap_or("").to_lowercase();
    let mut found: Vec<&Voice> = voices
        .iter()
        .filter(|v| v.languages.iter().any(|l| *l == wanted))
        .collect();
    found.sort_by_key(|v| !v.default);
    found
}

/// The total download size of some voices, in bytes. Shown before an install.
pub fn total_bytes(voices: &[&Voice]) -> u64 {
    voices.iter().map(|v| v.bytes).sum()
}

/// Written into a voice's folder when its install finished. A folder without it is not an installed voice.
pub const MARKER: &str = "installed.json";

/// The folder of a voice in `root` (normally the helper's voices folder).
pub fn voice_dir(root: &Path, voice: &Voice) -> PathBuf {
    root.join(&voice.id)
}

/// True when the voice was installed completely (its marker is there).
pub fn is_installed_in(root: &Path, voice: &Voice) -> bool {
    voice_dir(root, voice).join(MARKER).is_file()
}

/// Installs one voice into `root`: downloads the archive, checks its SHA-256, unpacks it, and removes the archive's
/// top folder. Nothing is left in place when a check fails.
pub fn install_into(root: &Path, voice: &Voice, transfer: &Transfer) -> Result<(), String> {
    if !voice.url.starts_with(TRUSTED_PREFIX) {
        return Err(format!("{} is not downloaded from the sherpa-onnx release", voice.name));
    }
    fs::create_dir_all(root).map_err(|e| format!("cannot create {}: {}", root.display(), e))?;
    // The window shows the whole voice: its archive.
    transfer.progress.total.store(voice.bytes, Ordering::Relaxed);
    let _ = fs::remove_file(voice_dir(root, voice).join(MARKER));

    let archive = root.join(format!("{}.part", voice.file));
    if let Err(e) = transfer.download(&voice.url, &archive, Some(voice.bytes)) {
        let _ = fs::remove_file(&archive);
        return Err(format!("{} could not be downloaded: {}", voice.file, e));
    }
    let bytes = fs::read(&archive).map_err(|e| format!("cannot read {}: {}", archive.display(), e))?;
    let _ = fs::remove_file(&archive);
    if bytes.len() as u64 != voice.bytes {
        return Err(format!(
            "{} is {} bytes, the catalogue says {}. Nothing was installed.",
            voice.file,
            bytes.len(),
            voice.bytes
        ));
    }
    if sha256::hex(&bytes) != voice.sha256 {
        return Err(format!("the SHA-256 check of {} failed. Nothing was installed.", voice.file));
    }

    let work = root.join(format!("{}.unpacking", voice.id));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("cannot create {}: {}", work.display(), e))?;
    unpack(&bytes, &work)?;
    let dir = voice_dir(root, voice);
    settle(&work, &dir)?;

    let marker = format!("{{\"id\":{},\"sha256\":{}}}\n", json::quote(&voice.id), json::quote(&voice.sha256));
    fs::write(dir.join(MARKER), marker).map_err(|e| format!("cannot finish the install of {}: {}", voice.name, e))
}

/// Installs every voice in `voices`, in order. A voice that fails is reported and the others still install.
/// Returns one line per failure (empty when everything was installed or was already there).
pub fn install_all(root: &Path, voices: &[&Voice], transfer: &Transfer) -> Vec<String> {
    let mut failures = Vec::new();
    for voice in voices {
        if is_installed_in(root, voice) {
            continue;
        }
        if let Err(e) = install_into(root, voice, transfer) {
            failures.push(format!("{}: {}", voice.name, e));
        }
    }
    failures
}

/// Unpacks a .tar.bz2 archive into `into`. The tar library refuses paths that leave that folder.
pub(crate) fn unpack(bytes: &[u8], into: &Path) -> Result<(), String> {
    let decoder = bzip2::read::BzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(into)
        .map_err(|e| format!("the archive could not be unpacked: {}", e))
}

/// Moves the unpacked files into `dir`. An archive that has one top folder (sherpa-onnx packs its voices that way)
/// gives its contents, not the folder itself.
pub(crate) fn settle(work: &Path, dir: &Path) -> Result<(), String> {
    let entries: Vec<PathBuf> = fs::read_dir(work)
        .map_err(|e| format!("cannot read {}: {}", work.display(), e))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    let source = if entries.len() == 1 && entries[0].is_dir() {
        entries[0].clone()
    } else {
        work.to_path_buf()
    };
    let _ = fs::remove_dir_all(dir);
    fs::rename(&source, dir).map_err(|e| format!("cannot save the voice in {}: {}", dir.display(), e))?;
    if source != work {
        let _ = fs::remove_dir_all(work);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_catalogue_parses_and_every_download_is_from_the_sherpa_release() {
        let voices = catalogue().expect("voices.json must parse");
        assert!(voices.len() >= 2);
        assert!(voices.iter().all(|v| v.url.starts_with(TRUSTED_PREFIX)));
        assert!(voices.iter().all(|v| v.sha256.len() == 64));
    }

    #[test]
    fn english_gets_every_voice_that_speaks_it_with_the_default_first() {
        let voices = catalogue().unwrap();
        let english = voices_for(&voices, "en");
        assert_eq!(english.len(), 7);
        assert!(english[0].default);
        assert_eq!(total_bytes(&english), english.iter().map(|v| v.bytes).sum::<u64>());
    }

    #[test]
    fn arabic_gets_the_voice_that_speaks_it_and_chinese_gets_kokoro() {
        let voices = catalogue().unwrap();
        let arabic = voices_for(&voices, "ar");
        assert_eq!(arabic.len(), 1);
        assert_eq!(arabic[0].id, "supertonic-3");
        let chinese = voices_for(&voices, "zh-CN");
        assert_eq!(chinese.len(), 1);
        assert_eq!(chinese[0].id, "kokoro-v1.1-zh-int8");
    }

    #[test]
    fn a_download_from_another_address_is_refused() {
        let text = r#"{"voices":[{"id":"x","name":"x","languages":["en"],"file":"x.tar.bz2","url":"https://example.com/x.tar.bz2","bytes":10,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","licence":"MIT","licenceUrl":"https://example.com","acceptLicence":false,"default":true}]}"#;
        assert!(parse_catalogue(text).is_err());
    }

    #[test]
    fn a_checksum_that_is_not_sha256_is_refused() {
        let text = r#"{"voices":[{"id":"x","name":"x","languages":["en"],"file":"x.tar.bz2","url":"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/x.tar.bz2","bytes":10,"sha256":"abc","licence":"MIT","licenceUrl":"https://example.com","acceptLicence":false,"default":true}]}"#;
        assert!(parse_catalogue(text).is_err());
    }

    /// A small .tar.bz2 with one top folder, built in memory the way the release archives are laid out.
    fn sample_archive() -> Vec<u8> {
        use std::io::Write;
        let mut builder = tar::Builder::new(Vec::new());
        let data = b"hello";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        builder.append_data(&mut header, "voice-pack/model.onnx", &data[..]).unwrap();
        let tar_bytes = builder.into_inner().unwrap();
        let mut encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap()
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("atlas-voices-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn an_archive_with_one_top_folder_is_unpacked_without_that_folder() {
        let root = scratch("unpack");
        let work = root.join("work");
        unpack(&sample_archive(), &work).unwrap();
        let dir = root.join("voice");
        settle(&work, &dir).unwrap();
        assert_eq!(fs::read(dir.join("model.onnx")).unwrap(), b"hello");
        assert!(!work.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_voice_is_installed_only_when_its_marker_is_there() {
        let root = scratch("marker");
        let voices = catalogue().unwrap();
        let john = voices.iter().find(|v| v.id == "piper-john-us").unwrap();
        assert!(!is_installed_in(&root, john));
        fs::create_dir_all(voice_dir(&root, john)).unwrap();
        assert!(!is_installed_in(&root, john));
        fs::write(voice_dir(&root, john).join(MARKER), "{}\n").unwrap();
        assert!(is_installed_in(&root, john));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn english_has_seven_voices_and_the_size_is_their_sum() {
        let voices = catalogue().unwrap();
        let english = voices_for(&voices, "en");
        assert_eq!(english.len(), 7);
        assert_eq!(english[0].id, "supertonic-3");
        let sum: u64 = english.iter().map(|v| v.bytes).sum();
        assert_eq!(total_bytes(&english), sum);
    }
}
