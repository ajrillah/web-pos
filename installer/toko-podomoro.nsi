; TOKO PODOMORO installer (NSIS 3). docs/design.md section 11.2.
;
; Inputs (relative to this script; override with /D):
;   NODE_DIR  folder holding the portable Windows node.exe (x64, Node 26)   default: node
;   APP_DIR   staged app from `node installer/prepare.mjs`                  default: build\app
;   VERSION   shown in Apps & features and the setup file name              default: 0.0.0
; Build:  makensis /DVERSION=0.2.0 installer\toko-podomoro.nsi
; Output: installer\output\TokoPodomoro-Setup-<VERSION>.exe
;
; Installs to C:\Program Files\TokoPodomoro. Data lives in C:\ProgramData\TokoPodomoro and is
; never removed by the uninstaller.

Unicode true
SetCompressor /SOLID lzma

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef NODE_DIR
  !define NODE_DIR "node"
!endif
!ifndef APP_DIR
  !define APP_DIR "build\app"
!endif

!if ! /FileExists "${NODE_DIR}\node.exe"
  !error "node.exe not found in ${NODE_DIR}. Download the Node 26 Windows x64 zip and copy node.exe there."
!endif
!if ! /FileExists "${APP_DIR}\main.js"
  !error "${APP_DIR}\main.js not found. Run: pnpm build && node installer/prepare.mjs"
!endif

!define APP_NAME "TOKO PODOMORO"
!define APP_KEY "TokoPodomoro"
!define PUBLISHER "TOKO PODOMORO"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_KEY}"
!define DATA_DIR "$COMMONPROGRAMDATA\${APP_KEY}"
; Shortcuts run the launcher with wscript (no console window). Not $SYSDIR: this installer is a
; 32-bit program, where $SYSDIR is SysWOW64; the stored path must be the 64-bit System32.
!define LAUNCH_TARGET "$WINDIR\System32\wscript.exe"
!define LAUNCH_ICON "$WINDIR\System32\shell32.dll"
!define LAUNCH_ARGS '"$INSTDIR\launcher.vbs"'

Name "${APP_NAME}"
!if ! /FileExists "output\*"
  !system 'mkdir output'
!endif
OutFile "output\TokoPodomoro-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_KEY}"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey /LANG=0 "CompanyName" "${PUBLISHER}"
VIAddVersionKey /LANG=0 "LegalCopyright" "${PUBLISHER}"

!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Buka ${APP_NAME} sekarang"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"

; Stops a running TOKO PODOMORO server (only node.exe from this install folder), so its files
; can be replaced or removed. Other Node programs on the PC are left alone.
!macro StopServer
  nsExec::ExecToLog `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -eq '$INSTDIR\node\node.exe' } | Stop-Process -Force"`
  Pop $0
  Sleep 1000
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APP_NAME} membutuhkan Windows 64-bit."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

Function LaunchApp
  Exec '"${LAUNCH_TARGET}" ${LAUNCH_ARGS}'
FunctionEnd

Section "Install"
  SetShellVarContext all
  !insertmacro StopServer

  ; Replace program files completely on upgrade; the data folder is not touched.
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"

  SetOutPath "$INSTDIR"
  File "launcher.vbs"
  SetOutPath "$INSTDIR\node"
  File "${NODE_DIR}\node.exe"
  SetOutPath "$INSTDIR\app"
  File /r "${APP_DIR}\*.*"

  ; Data folder: created here (by the admin) and made writable for every local user, because the
  ; server runs as the logged-in user. S-1-5-32-545 = BUILTIN\Users (any Windows language).
  CreateDirectory "${DATA_DIR}"
  nsExec::ExecToLog 'icacls "${DATA_DIR}" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
  Pop $0

  ; Shortcuts: desktop, Start Menu, and Startup (autostart on login, every user).
  SetOutPath "$INSTDIR"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "${LAUNCH_TARGET}" '${LAUNCH_ARGS}' "${LAUNCH_ICON}" 12
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "${LAUNCH_TARGET}" '${LAUNCH_ARGS}' "${LAUNCH_ICON}" 12
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Hapus ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"
  CreateShortcut "$SMSTARTUP\${APP_NAME}.lnk" "${LAUNCH_TARGET}" '${LAUNCH_ARGS}' "${LAUNCH_ICON}" 12

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  !insertmacro StopServer

  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMSTARTUP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  Delete "$INSTDIR\launcher.vbs"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  ; ${DATA_DIR} (database, config, backups) is kept on purpose.
  DetailPrint "Data toko tetap disimpan di ${DATA_DIR}"
SectionEnd
