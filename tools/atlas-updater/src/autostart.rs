// Starts the helper when the user logs in, in the background (no window, no terminal).
//   Windows: a shortcut in the current user's Startup folder. The installer makes it (no registry, no program runs
//            to set it up). Windows Settings, under Apps, then Startup, turns it on or off.
//   macOS:   a LaunchAgent in ~/Library/LaunchAgents.
//   Linux:   a desktop entry in ~/.config/autostart (XDG autostart).
// The helper starts with --serve, which does not open a browser window.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

const LAUNCH_AGENT_LABEL: &str = "com.atlas-translation.helper";
const DESKTOP_FILE: &str = "atlas-translation-helper.desktop";

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

fn launch_agent_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join("Library").join("LaunchAgents").join(format!("{}.plist", LAUNCH_AGENT_LABEL)))
}

fn desktop_path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|h| h.join(".config")))?;
    Some(base.join("autostart").join(DESKTOP_FILE))
}

/// The Startup folder shortcut the installer makes when the user chooses to start with Windows.
#[cfg(windows)]
fn startup_shortcut_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|appdata| {
        PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup")
            .join("Atlas Helper.lnk")
    })
}

/// The helper's own program file. An AppImage runs from a temporary folder, so its file (the APPIMAGE variable) is used:
/// the browsers and the start-at-login entry must still find it after the helper closes.
pub fn program() -> Result<PathBuf, String> {
    if let Some(file) = std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file()) {
        return Ok(file);
    }
    std::env::current_exe().map_err(|e| format!("cannot find the helper program: {}", e))
}

/// A command that does not open a console window on Windows. Used for the registry calls and for the engine program.
pub fn quiet(mut command: Command) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// True when the helper starts at login.
pub fn is_enabled() -> bool {
    #[cfg(windows)]
    {
        return startup_shortcut_path().map(|p| p.is_file()).unwrap_or(false);
    }
    #[cfg(target_os = "macos")]
    {
        return launch_agent_path().map(|p| p.is_file()).unwrap_or(false);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        desktop_path().map(|p| p.is_file()).unwrap_or(false)
    }
}

/// Turns starting at login on or off.
pub fn set_enabled(on: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        // The helper does not write to Windows. The installer makes the shortcut; Windows Settings changes it.
        let _ = on;
        return Err("Windows keeps the startup list. Turn it on or off in Windows Settings, under Apps, then Startup.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return set_macos(on);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        set_linux(on)
    }
}

fn set_macos(on: bool) -> Result<(), String> {
    let path = launch_agent_path().ok_or("cannot find your home folder")?;
    if !on {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("cannot remove {}: {}", path.display(), e)),
        };
    }
    let exe = program()?;
    let plist = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>{}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>--serve</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>\n",
        LAUNCH_AGENT_LABEL,
        exe.display()
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, plist).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}

fn set_linux(on: bool) -> Result<(), String> {
    let path = desktop_path().ok_or("cannot find your home folder")?;
    if !on {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("cannot remove {}: {}", path.display(), e)),
        };
    }
    let exe = program()?;
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Atlas Helper\nComment=Runs the Atlas Helper in the background\nExec=\"{}\" --serve\nX-GNOME-Autostart-enabled=true\nTerminal=false\n",
        exe.display()
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, entry).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}
