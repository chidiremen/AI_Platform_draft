@echo off
rem =================================================================
rem  AI Tool Catalog - one-time setup on a Windows machine.
rem  Creates .env, the Python venv, installs dependencies and applies
rem  migrations. Re-running it is safe (idempotent).
rem  Run this once by hand BEFORE registering start.bat in the
rem  Task Scheduler.
rem =================================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo === 1/5 .env ===
if exist "%ROOT%.env" goto :env_ok
copy "%ROOT%.env.example" "%ROOT%.env" >nul
if errorlevel 1 goto :fail
echo     created .env from .env.example
echo.
echo     IMPORTANT - check .env before starting:
echo       VITE_USE_MOCK=false  talks to Django (real data). This is the default.
echo       VITE_USE_MOCK=true   demo mode: logins use built-in demo users and the
echo                            database is never touched. If you copied a
echo                            db.sqlite3 here, keep this false.
echo       FRONTEND_PORT / BACKEND_PORT must not clash with another instance.
echo.
goto :env_done
:env_ok
echo     .env already exists - keeping it
:env_done

echo === 2/5 python venv ===
set "PY=%ROOT%backend\.venv\Scripts\python.exe"
if exist "%PY%" goto :venv_ok
where python >nul 2>&1
if errorlevel 1 echo [ERROR] python not found on PATH. Install Python 3.11+ first.
if errorlevel 1 goto :fail
python -m venv "%ROOT%backend\.venv"
if errorlevel 1 goto :fail
echo     created backend\.venv
goto :venv_done
:venv_ok
echo     venv already exists
:venv_done

echo === 3/5 python packages ===
"%PY%" -m pip install --upgrade pip
if errorlevel 1 goto :fail
"%PY%" -m pip install -r "%ROOT%backend\requirements.txt"
if errorlevel 1 goto :fail

echo === 4/5 migrations ===
pushd "%ROOT%backend"
"%PY%" manage.py migrate
if errorlevel 1 popd
if errorlevel 1 goto :fail
popd

echo === 5/5 node packages ===
where npm >nul 2>&1
if errorlevel 1 echo [ERROR] npm not found on PATH. Install Node.js 20+ first.
if errorlevel 1 goto :fail
pushd "%ROOT%frontend"
call npm ci
if errorlevel 1 call npm install
if errorlevel 1 popd
if errorlevel 1 goto :fail
popd

echo.
echo === setup complete ===
echo Create an admin user with:
echo     backend\.venv\Scripts\python.exe backend\manage.py createsuperuser
echo Then start everything with:
echo     start.bat
endlocal
exit /b 0

:fail
echo.
echo [ERROR] setup failed - see the messages above.
endlocal
exit /b 1
