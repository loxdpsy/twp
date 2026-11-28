// The helper's tray icon: the Atlas logo in the notification area, with a menu (Open, Quit).
// Clicking the icon with the left button opens the window. Closing the window keeps the helper in the tray.

use crate::i18n::tr;
use tray_icon::menu::{Menu, MenuEvent, MenuId, MenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

/// What the user asked for from the tray.
#[derive(Debug, PartialEq)]
pub enum TrayAction {
    Show,
    Quit,
}

pub struct Tray {
    // Kept alive for as long as the helper runs: dropping it removes the icon.
    _icon: TrayIcon,
    open_id: MenuId,
    quit_id: MenuId,
}

/// Creates the tray icon from square RGBA pixels (size x size). Fails when the desktop has no tray.
pub fn create(rgba: Vec<u8>, size: u32) -> Result<Tray, String> {
    let icon = Icon::from_rgba(rgba, size, size).map_err(|e| format!("cannot read the tray icon: {}", e))?;
    let open = MenuItem::new(tr("Open Atlas Helper"), true, None);
    let quit = MenuItem::new(tr("Quit"), true, None);
    let menu = Menu::new();
    menu.append(&open).map_err(|e| format!("cannot build the tray menu: {}", e))?;
    menu.append(&quit).map_err(|e| format!("cannot build the tray menu: {}", e))?;
    let open_id = open.id().clone();
    let quit_id = quit.id().clone();
    let tray = TrayIconBuilder::new()
        .with_tooltip("Atlas Helper")
        .with_icon(icon)
        .with_menu(Box::new(menu))
        .build()
        .map_err(|e| format!("cannot show the tray icon: {}", e))?;
    Ok(Tray { _icon: tray, open_id, quit_id })
}

/// The tray events that happened since the last call.
pub fn poll(tray: &Tray) -> Vec<TrayAction> {
    let mut actions = Vec::new();
    while let Ok(event) = TrayIconEvent::receiver().try_recv() {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            actions.push(TrayAction::Show);
        }
    }
    while let Ok(event) = MenuEvent::receiver().try_recv() {
        if event.id == tray.open_id {
            actions.push(TrayAction::Show);
        } else if event.id == tray.quit_id {
            actions.push(TrayAction::Quit);
        }
    }
    actions
}
