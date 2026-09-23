@echo off
rem ---------------------------------------------------------------
rem  Report stalled themes to Power Automate (weekly batch).
rem
rem  Windows Task Scheduler:
rem    Program/script : C:\work\AI_platform_draft\scripts\notify_stalled.bat
rem    Start in       : C:\work\AI_platform_draft
rem    Trigger        : weekly, e.g. Monday 09:00
rem
rem  "Stalled" is derived from the last progress date, not stored, so
rem  nobody notices unless someone opens the page. This batch pushes it.
rem  It sends ONE combined message, never one per theme.
rem  Logs to logs\notify_stalled.log.
rem ---------------------------------------------------------------
setlocal EnableExtensions
set "ROOT=%~dp0..\"
call "%~dp0load_env.bat"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "PY=%ROOT%backend\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

if not exist "%ROOT%logs" mkdir "%ROOT%logs"
set "LOG=%ROOT%logs\notify_stalled.log"

cd /d "%ROOT%backend"
echo. >> "%LOG%"
echo [%DATE% %TIME%] notify_stalled_themes >> "%LOG%"
"%PY%" manage.py notify_stalled_themes >> "%LOG%" 2>&1
echo [%DATE% %TIME%] exit code %ERRORLEVEL% >> "%LOG%"
endlocal
