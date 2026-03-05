; LawClaw Custom NSIS Uninstaller Script
; Provides a "Complete Removal" option during uninstallation.
; The cleanup scope is limited to LawClaw data only:
; - ~/.openclaw/workspace-lawclaw-main
; - AppData\Local\clawx
; - AppData\Roaming\clawx
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
    "Do you want to remove LawClaw user data?$\r$\n$\r$\nThis will delete:$\r$\n  - .openclaw\\workspace-lawclaw-main (LawClaw workspace only)$\r$\n  - AppData\\Local\\clawx (local app data)$\r$\n  - AppData\\Roaming\\clawx (roaming app data)$\r$\n$\r$\nOther OpenClaw data in .openclaw will be kept.$\r$\n$\r$\nSelect 'No' to keep all data for future reinstallation." \
    /SD IDNO IDYES _cu_removeData IDNO _cu_skipRemove

  _cu_removeData:
    ; --- Always remove current user's data first ---
    RMDir /r "$PROFILE\.openclaw\workspace-lawclaw-main"
    RMDir /r "$LOCALAPPDATA\clawx"
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

    RMDir /r "$R2\.openclaw\workspace-lawclaw-main"
    RMDir /r "$R2\AppData\Local\clawx"
    RMDir /r "$R2\AppData\Roaming\clawx"

  _cu_enumNext:
    IntOp $R0 $R0 + 1
    Goto _cu_enumLoop

  _cu_enumDone:
  _cu_skipRemove:
!macroend
