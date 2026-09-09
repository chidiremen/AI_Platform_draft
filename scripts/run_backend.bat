@echo off
rem ---------------------------------------------------------------
rem  Django dev server. Started by start.bat in its own window.
rem  Not meant to be launched from Task Scheduler directly
rem  (use start.bat, which also starts the frontend).
rem  --noreload is intentional: the autoreloader forks a second
rem  process, which makes stop.bat unable to shut things down cleanly.
rem ---------------------------------------------------------------
setlocal EnableExtensions
set "ROOT=%~dp0..\"
call "%~dp0load_env.bat"

set "PY=%ROOT%backend\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

if not exist "%ROOT%logs" mkdir "%ROOT%logs"
set "LOG=%ROOT%logs\backend.log"

cd /d "%ROOT%backend"
echo. >> "%LOG%"
echo [%DATE% %TIME%] starting Django on 0.0.0.0:%BACKEND_PORT% >> "%LOG%"
"%PY%" manage.py runserver 0.0.0.0:%BACKEND_PORT% --noreload >> "%LOG%" 2>&1
echo [%DATE% %TIME%] Django exited with code %ERRORLEVEL% >> "%LOG%"
endlocal
