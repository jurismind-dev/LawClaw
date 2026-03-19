@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

set "UV_EXE=%LAWCLAW_BUNDLED_UV_EXE%"
if not defined UV_EXE set "UV_EXE=%~dp0..\bin\uv.exe"

if not exist "%UV_EXE%" (
  echo Bundled uv runtime not found: %UV_EXE% 1>&2
  exit /b 1
)

set "PYTHON_EXE="
for /f "usebackq delims=" %%I in (`"%UV_EXE%" python find 3.12 2^>nul`) do (
  if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
)

if not defined PYTHON_EXE (
  "%UV_EXE%" python install 3.12
  if errorlevel 1 exit /b %errorlevel%
  for /f "usebackq delims=" %%I in (`"%UV_EXE%" python find 3.12 2^>nul`) do (
    if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
  )
)

if not defined PYTHON_EXE (
  echo Managed Python 3.12 is not available through bundled uv. 1>&2
  exit /b 1
)

"%PYTHON_EXE%" %*
exit /b %errorlevel%
