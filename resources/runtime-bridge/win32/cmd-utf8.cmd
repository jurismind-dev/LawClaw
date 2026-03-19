@echo off
setlocal

chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

"%SystemRoot%\System32\cmd.exe" %*
exit /b %errorlevel%
