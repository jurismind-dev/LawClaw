@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

if /i "%1"=="update" (
    echo openclaw is managed by LawClaw ^(bundled version^).
    echo.
    echo To update openclaw, update LawClaw:
    echo   Open LawClaw ^> Settings ^> Check for Updates
    echo   Or download the latest version from https://lawclaw.com
    exit /b 0
)

set ELECTRON_RUN_AS_NODE=1
set OPENCLAW_EMBEDDED_IN=LawClaw
"%~dp0..\..\LawClaw.exe" "%~dp0..\openclaw\openclaw.mjs" %*
endlocal
