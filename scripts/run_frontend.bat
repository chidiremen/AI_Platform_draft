@echo off
rem ---------------------------------------------------------------
rem  Vite dev server. Started by start.bat in its own window.
rem  The port comes from the root .env via vite.config.ts, so it is
rem  not passed on the command line here.
rem ---------------------------------------------------------------
setlocal EnableExtensions
set "ROOT=%~dp0..\"
call "%~dp0load_env.bat"

if not exist "%ROOT%logs" mkdir "%ROOT%logs"
set "LOG=%ROOT%logs\frontend.log"

cd /d "%ROOT%frontend"
echo. >> "%LOG%"
echo [%DATE% %TIME%] starting Vite on port %FRONTEND_PORT% >> "%LOG%"
call npm run dev >> "%LOG%" 2>&1
echo [%DATE% %TIME%] Vite exited with code %ERRORLEVEL% >> "%LOG%"
endlocal
