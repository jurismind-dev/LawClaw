@echo off
setlocal

set "NODE_EXE=%LAWCLAW_BUNDLED_NODE_EXE%"
if not defined NODE_EXE set "NODE_EXE=%~dp0..\..\LawClaw.exe"

set "NPX_CLI_JS=%LAWCLAW_BUNDLED_NPX_CLI_JS%"
if not defined NPX_CLI_JS set "NPX_CLI_JS=%~dp0..\..\node_modules\npm\bin\npx-cli.js"

if not exist "%NODE_EXE%" (
  echo Bundled Node runtime not found: %NODE_EXE% 1>&2
  exit /b 1
)

if not exist "%NPX_CLI_JS%" (
  echo Bundled npx runtime not found: %NPX_CLI_JS% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%NODE_EXE%" "%NPX_CLI_JS%" %*
exit /b %errorlevel%
