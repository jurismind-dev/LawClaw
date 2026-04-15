; LawClaw Custom NSIS Uninstaller Script
; Provides a "Complete Removal" option during uninstallation.
; The cleanup scope removes LawClaw local data plus the bundled OpenClaw
; runtime data used by LawClaw:
; - ~/.LawClaw
; - ~/.openclaw
; - AppData\Local\LawClaw / clawx (+ updater caches)
; - AppData\Roaming\LawClaw / clawx
; Handles both per-user and per-machine (all users) installations.

!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!define LAWCLAW_LEGACY_SHARED_APP_GUID "36abd259-b5f8-5a78-aae7-c5b60d324643"
!define LAWCLAW_LEGACY_SHARED_INSTALL_REGISTRY_KEY "Software\${LAWCLAW_LEGACY_SHARED_APP_GUID}"
!define LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LAWCLAW_LEGACY_SHARED_APP_GUID}"
!define LAWCLAW_LEGACY_UNINSTALL_DISPLAY_NAME "劳有钳 (LawClaw)"

Var /GLOBAL LegacyLawClawPerUserInstallLocation
Var /GLOBAL LegacyLawClawPerMachineInstallLocation
Var /GLOBAL LegacyLawClawPerUserOwned
Var /GLOBAL LegacyLawClawPerMachineOwned

Function DetectLegacyLawClawPerUser
  StrCpy $LegacyLawClawPerUserInstallLocation ""
  StrCpy $LegacyLawClawPerUserOwned "0"

  ReadRegStr $0 HKCU "${LAWCLAW_LEGACY_SHARED_INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKCU "${LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY}" DisplayName

  ${if} $1 == "${LAWCLAW_LEGACY_UNINSTALL_DISPLAY_NAME}"
    StrCpy $LegacyLawClawPerUserOwned "1"
    StrCpy $LegacyLawClawPerUserInstallLocation "$0"
    Return
  ${endIf}

  ${if} $0 != ""
    IfFileExists "$0\LawClaw.exe" 0 +3
      StrCpy $LegacyLawClawPerUserOwned "1"
      StrCpy $LegacyLawClawPerUserInstallLocation "$0"
  ${endIf}
FunctionEnd

Function DetectLegacyLawClawPerMachine
  StrCpy $LegacyLawClawPerMachineInstallLocation ""
  StrCpy $LegacyLawClawPerMachineOwned "0"

  ReadRegStr $0 HKLM "${LAWCLAW_LEGACY_SHARED_INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $1 HKLM "${LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY}" DisplayName

  ${if} $1 == "${LAWCLAW_LEGACY_UNINSTALL_DISPLAY_NAME}"
    StrCpy $LegacyLawClawPerMachineOwned "1"
    StrCpy $LegacyLawClawPerMachineInstallLocation "$0"
    Return
  ${endIf}

  ${if} $0 != ""
    IfFileExists "$0\LawClaw.exe" 0 +3
      StrCpy $LegacyLawClawPerMachineOwned "1"
      StrCpy $LegacyLawClawPerMachineInstallLocation "$0"
  ${endIf}
FunctionEnd

Function DetectLegacyLawClawSharedRegistry
  Call DetectLegacyLawClawPerUser
  Call DetectLegacyLawClawPerMachine
FunctionEnd

!macro customHeader
  ShowInstDetails hide
  ShowUninstDetails hide
!macroend

!macro customInit
  Call DetectLegacyLawClawSharedRegistry

  StrCpy $R7 ""
  ReadRegStr $R7 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R7 == ""
    ReadRegStr $R7 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${endIf}

  ${if} $R7 == ""
    ${if} $LegacyLawClawPerMachineOwned == "1"
    ${andIf} $LegacyLawClawPerMachineInstallLocation != ""
      !insertmacro setInstallModePerAllUsers
      StrCpy $INSTDIR "$LegacyLawClawPerMachineInstallLocation"
    ${elseif} $LegacyLawClawPerUserOwned == "1"
    ${andIf} $LegacyLawClawPerUserInstallLocation != ""
      !insertmacro setInstallModePerUser
      StrCpy $INSTDIR "$LegacyLawClawPerUserInstallLocation"
    ${endIf}
  ${endIf}
!macroend

!macro customCheckAppRunning
  ; Keep installer internals silent for end users. We still run the same
  ; upgrade safety steps, but without exposing file deletion/copy logs.
  SetDetailsPrint none
  StrCpy $R9 ""

  ReadRegStr $R9 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R9 == ""
    ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${endIf}
  ${if} $R9 == ""
    ${if} $LegacyLawClawPerMachineOwned == "1"
    ${andIf} $LegacyLawClawPerMachineInstallLocation != ""
      StrCpy $R9 "$LegacyLawClawPerMachineInstallLocation"
    ${elseif} $LegacyLawClawPerUserOwned == "1"
    ${andIf} $LegacyLawClawPerUserInstallLocation != ""
      StrCpy $R9 "$LegacyLawClawPerUserInstallLocation"
    ${endIf}
  ${endIf}
  ${if} $R9 == ""
    StrCpy $R9 "$INSTDIR"
  ${endIf}

  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0

  ${if} $R0 == 0
    ${if} ${isUpdated}
      Sleep 8000
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${if} $R0 != 0
        nsExec::ExecToStack 'taskkill /F /IM openclaw-gateway.exe'
        Pop $0
        Pop $1
        Goto done_killing
      ${endIf}
    ${endIf}
    ${if} ${isUpdated}
    ${else}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK doStopProcess
      Quit
    ${endIf}

    doStopProcess:
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('$INSTDIR', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
    Pop $0
    Pop $1

    ${if} $R9 != "$INSTDIR"
      nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('$R9', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
      Pop $0
      Pop $1
    ${endIf}

    ${if} $0 != 0
      nsExec::ExecToStack 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
      Pop $0
      Pop $1
    ${endIf}

    nsExec::ExecToStack 'taskkill /F /IM openclaw-gateway.exe'
    Pop $0
    Pop $1

    Sleep 5000

    done_killing:
      ${nsProcess::Unload}
  ${endIf}

  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('$INSTDIR', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  Pop $1
  ${if} $R9 != "$INSTDIR"
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith('$R9', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
    Pop $0
    Pop $1
  ${endIf}

  nsExec::ExecToStack 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM openclaw-gateway.exe'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM crashpad_handler.exe'
  Pop $0
  Pop $1

  Sleep 2000
  SetOutPath $TEMP

  IfFileExists "$INSTDIR\" 0 _instdir_clean
    StrCpy $R8 0
  _find_free_stale:
    IfFileExists "$INSTDIR._stale_$R8\" 0 _found_free_stale
    IntOp $R8 $R8 + 1
    Goto _find_free_stale

  _found_free_stale:
    ClearErrors
    Rename "$INSTDIR" "$INSTDIR._stale_$R8"
    IfErrors 0 _stale_moved
      nsExec::ExecToStack 'cmd.exe /c rd /s /q "$INSTDIR"'
      Pop $0
      Pop $1
      Sleep 2000
      CreateDirectory "$INSTDIR"
      Goto _instdir_clean
  _stale_moved:
    CreateDirectory "$INSTDIR"
  _instdir_clean:

  DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" QuietUninstallString
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" QuietUninstallString
  !endif
!macroend

!macro customUnInstallCheck
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend

!macro customInstall
  ; Remove the legacy shared ClawX/LawClaw registry identity after the new
  ; LawClaw-specific installer identity has been written.
  ${if} $LegacyLawClawPerMachineOwned == "1"
    DeleteRegKey HKLM "${LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKLM "${LAWCLAW_LEGACY_SHARED_INSTALL_REGISTRY_KEY}"
  ${endIf}
  ${if} $LegacyLawClawPerUserOwned == "1"
    DeleteRegKey HKCU "${LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${LAWCLAW_LEGACY_SHARED_INSTALL_REGISTRY_KEY}"
  ${endIf}

  ; Keep a single LawClaw CLI entry in the current user's PATH so updates and
  ; reinstalls do not accumulate stale duplicates.
  StrCpy $1 "$INSTDIR\\resources\\cli"
  WriteRegStr HKCU "Software\\LawClaw" "PendingCliPath" "$1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$$key = ''HKCU:\Software\LawClaw''; $$props = Get-ItemProperty -Path $$key -ErrorAction SilentlyContinue; $$currentCli = $$props.PendingCliPath; $$previousCli = $$props.CliPath; $$current = [Environment]::GetEnvironmentVariable(''Path'', ''User''); $$parts = @(); if ($$current) { $$parts = $$current -split ''\;'' | Where-Object { $_ } }; $$parts = $$parts | Where-Object { [string]::Compare($_, $$currentCli, $$true) -ne 0 -and [string]::Compare($_, $$previousCli, $$true) -ne 0 }; if ($$currentCli) { $$parts += $$currentCli }; [Environment]::SetEnvironmentVariable(''Path'', ($$parts -join ''\;''), ''User'')"'
  WriteRegStr HKCU "Software\\LawClaw" "CliPath" "$1"
  DeleteRegValue HKCU "Software\\LawClaw" "PendingCliPath"
  ReadRegStr $2 HKCU "Environment" "Path"
  StrCmp $2 "" _ci_pathDone
  WriteRegExpandStr HKCU "Environment" "Path" $2
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=500

  _ci_pathDone:
!macroend

!macro customUnInstall
  ; Refresh the user PATH so new terminals observe the current environment.
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" _cu_pathDone
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
