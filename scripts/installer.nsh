; LawClaw Custom NSIS Uninstaller Script
; Provides a "Complete Removal" option during uninstallation.
; The cleanup scope removes LawClaw local data plus the bundled OpenClaw
; runtime data used by LawClaw:
; - ~/.LawClaw
; - ~/.openclaw
; - AppData\Local\LawClaw / clawx (+ updater caches)
; - AppData\Roaming\LawClaw / clawx
; Handles both per-user and per-machine (all users) installations.

!macro customUnInstall
  ; Remove resources\cli from user PATH
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" _cu_pathDone

  ; Keep existing PATH as-is for uninstall.
  ; (Custom string helper calls can break NSIS multi-arch build resolution.)
  WriteRegExpandStr HKCU "Environment" "Path" $0
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=500

  _cu_pathDone:

  ; Ask user if they want to remove LawClaw user data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to completely remove LawClaw local data?$\r$\n$\r$\nThis will delete:$\r$\n  - .LawClaw$\r$\n  - .openclaw$\r$\n  - AppData\\Local\\LawClaw / clawx$\r$\n  - AppData\\Local\\LawClaw-updater / clawx-updater$\r$\n  - AppData\\Roaming\\LawClaw / clawx$\r$\n$\r$\nSelect 'No' to keep these files for future reinstallation." \
    /SD IDNO IDYES _cu_removeData IDNO _cu_skipRemove

  _cu_removeData:
    ; --- Always remove current user's data first ---
    RMDir /r "$PROFILE\.LawClaw"
    RMDir /r "$PROFILE\.openclaw"
    RMDir /r "$LOCALAPPDATA\LawClaw"
    RMDir /r "$LOCALAPPDATA\clawx"
    RMDir /r "$LOCALAPPDATA\LawClaw-updater"
    RMDir /r "$LOCALAPPDATA\clawx-updater"
    RMDir /r "$APPDATA\LawClaw"
    RMDir /r "$APPDATA\clawx"

    ; --- For per-machine (all users) installs, enumerate all user profiles ---
    StrCpy $R0 0

  _cu_enumLoop:
    EnumRegKey $R1 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList" $R0
    StrCmp $R1 "" _cu_enumDone

    ReadRegStr $R2 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$R1" "ProfileImagePath"
    StrCmp $R2 "" _cu_enumNext

    ExpandEnvStrings $R2 $R2
    StrCmp $R2 $PROFILE _cu_enumNext

    RMDir /r "$R2\.LawClaw"
    RMDir /r "$R2\.openclaw"
    RMDir /r "$R2\AppData\Local\LawClaw"
    RMDir /r "$R2\AppData\Local\clawx"
    RMDir /r "$R2\AppData\Local\LawClaw-updater"
    RMDir /r "$R2\AppData\Local\clawx-updater"
    RMDir /r "$R2\AppData\Roaming\LawClaw"
    RMDir /r "$R2\AppData\Roaming\clawx"

  _cu_enumNext:
    IntOp $R0 $R0 + 1
    Goto _cu_enumLoop

  _cu_enumDone:
  _cu_skipRemove:
!macroend
