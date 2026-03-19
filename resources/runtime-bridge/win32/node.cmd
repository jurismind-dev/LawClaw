@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

set "NODE_EXE=%LAWCLAW_BUNDLED_NODE_EXE%"
if not defined NODE_EXE set "NODE_EXE=%~dp0..\..\LawClaw.exe"

if not exist "%NODE_EXE%" (
  echo Bundled Node runtime not found: %NODE_EXE% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%NODE_EXE%" %*
exit /b %errorlevel%
