@echo off
rem =================================================================
rem  AI Tool Catalog - start the backend (Django) and frontend (Vite)
rem
rem  Windows Task Scheduler:
rem    Action         : Start a program
rem    Program/script : C:\work\AI_platform_draft\start.bat
rem    Start in       : C:\work\AI_platform_draft
rem  Run it "only when the user is logged on" so that Node.js and the
rem  venv are on PATH. Details: docs\windows-task-scheduler.md
rem
rem  Usage : start.bat [open]      "open" also launches the browser
rem  Logs  : logs\start.log, logs\backend.log, logs\frontend.log
rem  Stop  : stop.bat
rem
rem  Written in flat goto style on purpose - nested parenthesised
rem  blocks are the classic source of silent breakage in .bat files.
rem =================================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "%ROOT%logs" mkdir "%ROOT%logs"
set "STARTLOG=%ROOT%logs\start.log"
set "FAILED="

call :log "======== start.bat %DATE% %TIME% ========"
call "%ROOT%scripts\load_env.bat"
call :log "ports: frontend=%FRONTEND_PORT% backend=%BACKEND_PORT% source=%ENV_PORT_SRC%"
rem A .env that exists but yields no ports usually means it was saved as
rem UTF-16 ("Unicode" in Notepad), which cmd cannot read. Warn loudly -
rem silently starting on the default ports is the confusing failure mode.
if /i "%ENV_PORT_SRC%"=="partial" call :log "[WARN] .env exists but the ports were not read from it - using defaults. Save .env as UTF-8, not UTF-16/Unicode."

rem ---- python -------------------------------------------------------
set "PY=%ROOT%backend\.venv\Scripts\python.exe"
if exist "%PY%" goto :py_ok
call :log "[WARN] venv missing at %PY% - run setup.bat once. Falling back to python on PATH."
set "PY=python"
where python >nul 2>&1
if errorlevel 1 call :log "[ERROR] python not found on PATH either."
if errorlevel 1 goto :fail
:py_ok
call :log "python: %PY%"

rem ---- node ---------------------------------------------------------
where npm >nul 2>&1
if errorlevel 1 call :log "[ERROR] npm not found on PATH. Install Node.js, or run the task as a user that has Node on PATH."
if errorlevel 1 goto :fail

rem ---- backend ------------------------------------------------------
call :port_pid %BACKEND_PORT% PID_B
if not defined PID_B goto :start_backend
call :log "[SKIP] backend already listening on port %BACKEND_PORT%, pid %PID_B%"
goto :backend_done
:start_backend
call :log "[RUN ] backend -> logs\backend.log"
start "AITC-backend" /min "%ROOT%scripts\run_backend.bat"
call :wait_port %BACKEND_PORT% backend 60
:backend_done

rem ---- frontend -----------------------------------------------------
call :port_pid %FRONTEND_PORT% PID_F
if not defined PID_F goto :start_frontend
call :log "[SKIP] frontend already listening on port %FRONTEND_PORT%, pid %PID_F%"
goto :frontend_done
:start_frontend
call :log "[RUN ] frontend -> logs\frontend.log"
start "AITC-frontend" /min "%ROOT%scripts\run_frontend.bat"
rem Vite's first cold start has to pre-bundle deps, so allow more time.
call :wait_port %FRONTEND_PORT% frontend 120
:frontend_done

if defined FAILED goto :fail

call :log "[DONE] app: http://localhost:%FRONTEND_PORT%/   api: http://localhost:%BACKEND_PORT%/api/"
if /i "%~1"=="open" start "" "http://localhost:%FRONTEND_PORT%/"
endlocal
exit /b 0

:fail
call :log "[ABORT] startup failed - check logs\backend.log and logs\frontend.log"
endlocal
exit /b 1


rem ============================ helpers ============================

:log
rem %1 = message (quoted). Goes to the console and to logs\start.log.
echo %~1
echo [%DATE% %TIME%] %~1 >> "%STARTLOG%"
goto :eof

:port_pid
rem %1 = tcp port, %2 = name of the variable receiving the PID.
rem The variable is left undefined when the port is free.
set "%~2="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /i "LISTENING" ^| findstr /c:":%~1 "') do if not defined %~2 set "%~2=%%P"
goto :eof

:wait_port
rem %1 = port, %2 = label used in messages, %3 = timeout in seconds.
rem Sets FAILED=1 on timeout.
set /a _wait=0
:wait_port_loop
call :port_pid %~1 _PID
if defined _PID goto :wait_port_ok
set /a _wait+=1
if %_wait% GEQ %~3 goto :wait_port_timeout
rem Sleep ~1s. 'ping' rather than 'timeout', because 'timeout' aborts
rem when stdin is redirected - which is exactly the Task Scheduler case.
ping -n 2 127.0.0.1 >nul
goto :wait_port_loop
:wait_port_ok
call :log "[ OK ] %~2 listening on port %~1, pid %_PID%"
goto :eof
:wait_port_timeout
call :log "[FAIL] %~2 did not come up on port %~1 within %~3 seconds"
set "FAILED=1"
goto :eof
