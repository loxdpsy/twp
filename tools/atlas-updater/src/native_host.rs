// The native messaging host: lets the browser start the helper when the browser starts.
//
// Chrome, Edge, Brave and the other Chromium browsers start a native host when the extension connects to it, and
// Firefox does the same. The extension connects once when the browser starts (background/helperLaunch.js). The browser
// then runs this program with the extension's origin as an argument (Firefox passes the manifest path and the add-on
// ID). In that case the program does not open a window: it starts the helper in the tray if the helper is not
// running, answers the browser with one message, and exits.
//
// The browser finds the host through a manifest file that names this program. Windows keeps the manifest path in the
// registry for the current user (no administrator rights). macOS and Linux keep a copy of the manifest in each
// browser's NativeMessagingHosts folder. A Chromium browser only accepts the extensions listed in the manifest, so
// the helper lists the origin of each extension the user allows in the helper window (register_origin).

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::store;

/// The name the extension uses in connectNative(). It must match the manifest's "name".
pub const HOST_NAME: &str = "com.atlas.helper";
/// The Firefox add-on ID from firefox_manifest.json.
const FIREFOX_ID: &str = "{fed15b8b-37be-49a7-97d7-e062452c568a}";
const MANIFEST_FILE: &str = "com.atlas.helper.json";
const ORIGINS_FILE: &str = "native-origins.txt";

/// True when a browser started this program as its native messaging host. Chromium passes the extension origin
/// (chrome-extension://...). Firefox passes the path of its manifest and the add-on ID.
pub fn is_launch(args: &[String]) -> bool {
    args.iter().any(|a| a.starts_with("chrome-extension://") || a.starts_with("moz-extension://") || a == FIREFOX_ID || a.ends_with(MANIFEST_FILE))
}

/// The browser's side: read its message, answer it, and return. Opens no window.
pub fn run() -> Result<(), String> {
    let mut stdin = std::io::stdin();
    let mut length = [0u8; 4];
    let has_message = stdin.read_exact(&mut length).is_ok();
    let mut body = String::new();
    if has_message {
        let size = (u32::from_le_bytes(length) as usize).min(1024 * 1024);
        let mut bytes = vec![0u8; size];
        if stdin.read_exact(&mut bytes).is_ok() {
            body = String::from_utf8_lossy(&bytes).to_string();
        }
    }
    let reply = handle(&body);
    if has_message {
        let mut out = std::io::stdout();
        let _ = out.write_all(&(reply.len() as u32).to_le_bytes());
        let _ = out.write_all(reply.as_bytes());
        let _ = out.flush();
    }
    Ok(())
}

/// Answers one message from the extension. "start" starts the helper if the user turned that on (the default for any
/// message that is not "get" or "set"). "get" reports the setting. "set" changes it and saves it in the helper's settings.
fn handle(body: &str) -> String {
    match field(body, "action").as_deref() {
        Some("get") => format!("{{\"ok\":true,\"start_with_browser\":{}}}", crate::settings::load().start_with_browser),
        Some("set") => {
            let on = field(body, "value").as_deref() == Some("true");
            let mut settings = crate::settings::load();
            settings.start_with_browser = on;
            match crate::settings::save(&settings) {
                Ok(()) => format!("{{\"ok\":true,\"start_with_browser\":{}}}", on),
                Err(e) => format!("{{\"ok\":false,\"error\":\"{}\"}}", escape(&e)),
            }
        }
        _ => {
            let wanted = crate::settings::load().start_with_browser;
            let started = wanted && ensure_helper_running();
            format!("{{\"ok\":true,\"started\":{}}}", started)
        }
    }
}

/// The value of one field of the small JSON message the extension sends, such as "set" for "action". Plain text
/// (quoted or not) is enough for the three messages the host knows.
fn field(body: &str, key: &str) -> Option<String> {
    let marker = format!("\"{}\"", key);
    let start = body.find(&marker)? + marker.len();
    let rest = body[start..].trim_start().strip_prefix(':')?.trim_start();
    if let Some(quoted) = rest.strip_prefix('"') {
        return quoted.find('"').map(|end| quoted[..end].to_string());
    }
    let end = rest.find(|c: char| c == ',' || c == '}').unwrap_or(rest.len());
    Some(rest[..end].trim().to_string())
}

/// Starts the helper in the tray (--serve) unless it already answers on its port. Returns true when it was started.
fn ensure_helper_running() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], crate::api::PORT));
    if TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok() {
        return false;
    }
    let exe = match crate::autostart::program() {
        Ok(path) => path,
        Err(_) => return false,
    };
    let mut command = Command::new(exe);
    command.arg("--serve").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Detached from the browser, so the helper keeps running after the browser's host process exits.
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    command.spawn().is_ok()
}

/// Makes the browsers able to start the helper for `origin`, an extension origin the user allowed in the helper window.
/// Firefox's manifest is always written (it names the add-on ID, which does not change). Chromium's lists every
/// allowed origin, so a second extension copy (for example an unpacked one) can use it too.
pub fn register_origin(origin: &str) -> Result<(), String> {
    let origins = add_origin(origin)?;
    let exe = crate::autostart::program()?;
    let exe_path = exe.display().to_string();
    let firefox_text = manifest_text(&exe_path, "allowed_extensions", &[FIREFOX_ID.to_string()]);
    let firefox_file = store::data_dir().join("native-host").join("firefox").join(MANIFEST_FILE);
    write_file(&firefox_file, &firefox_text)?;
    let chromium_text = if origins.is_empty() { None } else { Some(manifest_text(&exe_path, "allowed_origins", &origins)) };
    let chromium_file = store::data_dir().join("native-host").join("chromium").join(MANIFEST_FILE);
    if let Some(text) = &chromium_text {
        write_file(&chromium_file, text)?;
    }
    #[cfg(windows)]
    register_windows(chromium_text.as_ref().map(|_| chromium_file.as_path()), &firefox_file)?;
    #[cfg(not(windows))]
    register_unix(chromium_text.as_deref(), &firefox_text)?;
    Ok(())
}

/// The manifest file that a browser reads. `key` is "allowed_origins" (Chromium) or "allowed_extensions" (Firefox).
pub fn manifest_text(exe_path: &str, key: &str, values: &[String]) -> String {
    let list: Vec<String> = values.iter().map(|v| format!("\"{}\"", escape(v))).collect();
    format!(
        "{{\n  \"name\": \"{}\",\n  \"description\": \"Atlas Translation helper\",\n  \"path\": \"{}\",\n  \"type\": \"stdio\",\n  \"{}\": [{}]\n}}\n",
        HOST_NAME,
        escape(exe_path),
        key,
        list.join(", ")
    )
}

/// Escapes a value for a JSON string (the backslashes of a Windows path and any quote).
fn escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn origins_path() -> PathBuf {
    store::data_dir().join("native-host").join(ORIGINS_FILE)
}

/// The Chromium extension origins that were allowed so far, with the new one added. Only chrome-extension:// origins
/// are kept; the trailing slash that Chromium expects is added.
fn add_origin(origin: &str) -> Result<Vec<String>, String> {
    let mut list = read_origins();
    let mut value = origin.trim().to_string();
    if value.starts_with("chrome-extension://") {
        if !value.ends_with('/') {
            value.push('/');
        }
        if !list.contains(&value) {
            list.push(value);
            write_file(&origins_path(), &list.join("\n"))?;
        }
    }
    Ok(list)
}

fn read_origins() -> Vec<String> {
    fs::read_to_string(origins_path())
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("chrome-extension://"))
        .map(String::from)
        .collect()
}

fn write_file(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(path, text).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}

/// Windows: the manifest path goes in the current user's registry under each browser that is installed.
#[cfg(windows)]
fn register_windows(chromium_file: Option<&Path>, firefox_file: &Path) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let root = RegKey::predef(HKEY_CURRENT_USER);
    if let Some(file) = chromium_file {
        // Only browsers that have a key of their own are registered, so no empty keys are left for browsers not installed.
        for base in [
            "Software\\Google\\Chrome",
            "Software\\Chromium",
            "Software\\Microsoft\\Edge",
            "Software\\BraveSoftware\\Brave-Browser",
            "Software\\Vivaldi",
        ] {
            if root.open_subkey(base).is_ok() {
                set_manifest_key(&root, &format!("{}\\NativeMessagingHosts\\{}", base, HOST_NAME), file)?;
            }
        }
    }
    set_manifest_key(&root, &format!("Software\\Mozilla\\NativeMessagingHosts\\{}", HOST_NAME), firefox_file)
}

#[cfg(windows)]
fn set_manifest_key(root: &winreg::RegKey, path: &str, file: &Path) -> Result<(), String> {
    let (key, _) = root.create_subkey(path).map_err(|e| format!("cannot register the helper for the browser: {}", e))?;
    key.set_value("", &file.display().to_string()).map_err(|e| format!("cannot register the helper for the browser: {}", e))
}

/// macOS and Linux: a copy of the manifest goes into each browser's NativeMessagingHosts folder.
#[cfg(not(windows))]
fn register_unix(chromium_text: Option<&str>, firefox_text: &str) -> Result<(), String> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| "no home folder".to_string())?;
    let mac = cfg!(target_os = "macos");
    let support = if mac { home.join("Library").join("Application Support") } else { home.join(".config") };
    let browsers: &[&str] = if mac {
        &["Google/Chrome", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Vivaldi"]
    } else {
        &["google-chrome", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser", "vivaldi"]
    };
    if let Some(text) = chromium_text {
        for browser in browsers {
            let base = support.join(browser);
            if base.is_dir() {
                write_file(&base.join("NativeMessagingHosts").join(MANIFEST_FILE), text)?;
            }
        }
    }
    let firefox_dir = if mac {
        home.join("Library").join("Application Support").join("Mozilla").join("NativeMessagingHosts")
    } else {
        home.join(".mozilla").join("native-messaging-hosts")
    };
    write_file(&firefox_dir.join(MANIFEST_FILE), firefox_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_browser_launch_is_recognised_and_a_normal_start_is_not() {
        let chromium = vec!["chrome-extension://abcdefghijklmnop/".to_string()];
        assert!(is_launch(&chromium));
        let firefox = vec!["C:\\x\\com.atlas.helper.json".to_string(), FIREFOX_ID.to_string()];
        assert!(is_launch(&firefox));
        assert!(!is_launch(&["--serve".to_string()]));
        assert!(!is_launch(&[]));
    }

    #[test]
    fn the_message_fields_are_read() {
        let set = "{\"action\":\"set\",\"value\":true}";
        assert_eq!(field(set, "action").as_deref(), Some("set"));
        assert_eq!(field(set, "value").as_deref(), Some("true"));
        assert_eq!(field("{\"action\": \"get\"}", "action").as_deref(), Some("get"));
        assert_eq!(field("{\"action\":\"start\"}", "value"), None);
    }

    #[test]
    fn the_manifest_names_the_program_and_the_origins() {
        let text = manifest_text("C:\\Users\\me\\atlas-updater.exe", "allowed_origins", &["chrome-extension://abc/".to_string()]);
        assert!(text.contains("\"name\": \"com.atlas.helper\""));
        assert!(text.contains("\"path\": \"C:\\\\Users\\\\me\\\\atlas-updater.exe\""), "backslashes are escaped: {}", text);
        assert!(text.contains("\"allowed_origins\": [\"chrome-extension://abc/\"]"));
        assert!(text.contains("\"type\": \"stdio\""));
    }
}
