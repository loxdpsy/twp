; Atlas Helper installer for Windows. Built by .github/workflows/release.yml and updater.yml with Inno Setup 6.
; It installs for the current user only, so no administrator password is asked for. The helper runs from the folder
; it is installed in, and its settings and language packs are kept in %LOCALAPPDATA%\AtlasTranslation.
; Nothing is downloaded and run by the installer: every program it installs is in this file.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.2.7"
#endif
#ifndef SourceExe
  #define SourceExe "..\target\release\atlas-updater.exe"
#endif
; The offline engine (atlas-engine.exe and atlas_engine.dll). release.yml passes both; a test build may pass neither.
#ifdef EngineExe
  #ifdef EngineLib
    #define HasEngine
  #endif
#endif

[Setup]
AppId={{EDBD6038-BA8A-4970-8ED3-8B43B3FE1F42}
AppName=Atlas Helper
AppVersion={#MyAppVersion}
AppVerName=Atlas Helper {#MyAppVersion}
AppPublisher=Atlas Translation
AppPublisherURL=https://github.com/loxdpsy/AT
AppSupportURL=https://github.com/loxdpsy/AT/issues
DefaultDirName={localappdata}\Programs\Atlas Helper
DefaultGroupName=Atlas Helper
DisableProgramGroupPage=yes
DisableDirPage=no
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=atlas-updater-windows-setup
SetupIconFile=..\assets\atlas-helper.ico
UninstallDisplayIcon={app}\atlas-updater.exe
UninstallDisplayName=Atlas Helper
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
CloseApplicationsFilter=atlas-updater.exe
RestartApplications=no
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany=Atlas Translation
VersionInfoProductName=Atlas Helper

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Start Atlas Helper in the tray when I sign in to Windows"; GroupDescription: "Start:"; Flags: checkedonce

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "atlas-updater.exe"; Flags: ignoreversion
; Licence texts and notices (the repository's LICENSE, NOTICE.md and LICENSES folder), in the install folder.
Source: "..\..\..\LICENSE"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "..\..\..\NOTICE.md"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "..\..\..\LICENSES\*"; DestDir: "{app}\licenses\LICENSES"; Flags: ignoreversion recursesubdirs
#ifdef HasEngine
Source: "{#EngineExe}"; DestDir: "{app}"; DestName: "atlas-engine.exe"; Flags: ignoreversion
Source: "{#EngineLib}"; DestDir: "{app}"; DestName: "atlas_engine.dll"; Flags: ignoreversion
#endif

[InstallDelete]
; Copies that older helpers downloaded and ran. The engine in the install folder replaces them.
Type: files; Name: "{localappdata}\AtlasTranslation\engine\atlas-engine.exe"
Type: files; Name: "{localappdata}\AtlasTranslation\engine\atlas_engine.dll"

[Icons]
Name: "{group}\Atlas Helper"; Filename: "{app}\atlas-updater.exe"; IconFilename: "{app}\atlas-updater.exe"
Name: "{group}\Uninstall Atlas Helper"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Atlas Helper"; Filename: "{app}\atlas-updater.exe"; Tasks: desktopicon
; Starts the helper in the tray at sign-in. Windows Settings, under Apps, then Startup, lists it and can turn it off.
Name: "{userstartup}\Atlas Helper"; Filename: "{app}\atlas-updater.exe"; Parameters: "--serve"; IconFilename: "{app}\atlas-updater.exe"; Tasks: autostart

[Registry]
; Older versions wrote a Run entry for the sign-in start. It is removed, so the only sign-in start is the Startup shortcut above.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "AtlasTranslationHelper"; Flags: deletevalue

[Run]
; Starts the helper in the tray only, with no window and no console. Its window opens from the tray icon.
Filename: "{app}\atlas-updater.exe"; Parameters: "--serve"; Description: "Start Atlas Helper in the tray"; Flags: nowait postinstall skipifsilent
