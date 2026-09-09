@echo off
rem ---------------------------------------------------------------
rem  Django dev server. Started by start.bat in its own window.
rem  Not meant to be launched from Task Scheduler directly
rem  (use start.bat, which also starts the frontend).
rem
rem  --noreload is intentional: the autoreloader forks a second
rem  process, which makes stop.bat unable to shut things down cleanly.
rem ---------------------------------------------------------------
setlocal EnableExtensions
set "ROOT=%~dp0..\"
call "%~dp0load_env.bat"

rem --- Encoding -------------------------------------------------------
rem  Force Python into UTF-8 mode. When stdout is redirected to a file on
rem  Windows, Python otherwise encodes with the locale codepage (cp932 on
rem  a Japanese install). Any character outside cp932 - and this app is
rem  full of emoji in tool titles, forum posts and log lines - then raises
rem  UnicodeEncodeError and kills the server process.
rem  With this, backend.log is always UTF-8.
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

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
