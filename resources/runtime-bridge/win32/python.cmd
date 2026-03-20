@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

if not exist "%~dp0python-bridge.ps1" (
  echo Bundled Python bridge script not found: %~dp0python-bridge.ps1 1>&2
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0python-bridge.ps1" %*
exit /b %errorlevel%
