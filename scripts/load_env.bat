@echo off
rem ---------------------------------------------------------------
rem  Read FRONTEND_PORT / BACKEND_PORT from the project root .env
rem  and export them to the CALLING script (no setlocal on purpose).
rem  Falls back to the defaults when .env is missing or incomplete.
rem  Only simple "KEY=VALUE" lines are parsed; "#" starts a comment.
rem ---------------------------------------------------------------
set "_ENV_ROOT=%~dp0..\"
set "FRONTEND_PORT="
set "BACKEND_PORT="

if exist "%_ENV_ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%_ENV_ROOT%.env") do (
    call :_set_kv "%%A" "%%B"
  )
)

if not defined FRONTEND_PORT set "FRONTEND_PORT=5174"
if not defined BACKEND_PORT  set "BACKEND_PORT=8009"
set "_ENV_ROOT="
goto :eof

:_set_kv
rem Called per line so that plain %VAR% expansion works (no delayed expansion).
set "_K=%~1"
set "_V=%~2"
set "_K=%_K: =%"
set "_V=%_V: =%"
if /i "%_K%"=="FRONTEND_PORT" set "FRONTEND_PORT=%_V%"
if /i "%_K%"=="BACKEND_PORT"  set "BACKEND_PORT=%_V%"
set "_K="
set "_V="
goto :eof
