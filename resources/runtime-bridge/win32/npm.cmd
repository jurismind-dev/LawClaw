@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

set "NODE_EXE=%LAWCLAW_BUNDLED_NODE_EXE%"
if not defined NODE_EXE set "NODE_EXE=%~dp0..\..\LawClaw.exe"

set "NPM_CLI_JS=%LAWCLAW_BUNDLED_NPM_CLI_JS%"
if not defined NPM_CLI_JS set "NPM_CLI_JS=%~dp0..\..\node_modules\npm\bin\npm-cli.js"

if not exist "%NODE_EXE%" (
  echo Bundled Node runtime not found: %NODE_EXE% 1>&2
  exit /b 1
)

if not exist "%NPM_CLI_JS%" (
  echo Bundled npm runtime not found: %NPM_CLI_JS% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%NODE_EXE%" "%NPM_CLI_JS%" %*
exit /b %errorlevel%
