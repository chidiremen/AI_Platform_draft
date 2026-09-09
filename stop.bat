@echo off
rem =================================================================
rem  AI Tool Catalog - stop whatever start.bat launched.
rem  Kills the processes listening on FRONTEND_PORT / BACKEND_PORT,
rem  then sweeps up any leftover launcher windows by title.
rem  Safe to run when nothing is running.
rem =================================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "%ROOT%logs" mkdir "%ROOT%logs"
set "STARTLOG=%ROOT%logs\start.log"

call :log "======== stop.bat %DATE% %TIME% ========"
call "%ROOT%scripts\load_env.bat"

call :kill_port %FRONTEND_PORT% frontend
call :kill_port %BACKEND_PORT%  backend

rem The "start" wrapper windows normally close on their own once their
rem child process dies; kill any that lingered.
taskkill /F /FI "WINDOWTITLE eq AITC-backend*"  >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq AITC-frontend*" >nul 2>&1

call :log "[DONE] stopped"
endlocal
exit /b 0


rem ============================ helpers ============================

:log
echo %~1
echo [%DATE% %TIME%] %~1 >> "%STARTLOG%"
goto :eof

:kill_port
rem %1 = tcp port, %2 = label used in messages
set "_HIT="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /i "LISTENING" ^| findstr /c:":%~1 "') do call :kill_pid %%P "%~2" %~1
if not defined _HIT call :log "[SKIP] nothing listening on port %~1 - %~2"
goto :eof

:kill_pid
rem %1 = pid, %2 = label, %3 = port
set "_HIT=1"
taskkill /F /T /PID %~1 >nul 2>&1
if errorlevel 1 call :log "[WARN] could not kill %~2 pid %~1 on port %~3"
if not errorlevel 1 call :log "[KILL] %~2 pid %~1 on port %~3"
goto :eof
