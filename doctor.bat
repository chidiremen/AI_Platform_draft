@echo off
rem =================================================================
rem  AI Tool Catalog - diagnose a setup ("why can't I log in?").
rem  Read-only: it never changes data.
rem  Checks .env encoding and mock mode, the database location and its
rem  migration state, the user table, and whether media/ was copied.
rem  Run it from the folder you are trying to bring up.
rem =================================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
call "%ROOT%scripts\load_env.bat"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "PY=%ROOT%backend\.venv\Scripts\python.exe"
if exist "%PY%" goto :py_ok
echo [WARN] venv missing - falling back to python on PATH. Run setup.bat once.
set "PY=python"
:py_ok

cd /d "%ROOT%backend"
"%PY%" manage.py doctor
endlocal
