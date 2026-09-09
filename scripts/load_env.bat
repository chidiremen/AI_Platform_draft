@echo off
rem ---------------------------------------------------------------
rem  Read FRONTEND_PORT / BACKEND_PORT from the project root .env
rem  and export them to the CALLING script (no setlocal on purpose).
rem  Falls back to the defaults when .env is missing or unreadable.
rem
rem  Only simple "KEY=VALUE" lines are parsed; "#" starts a comment.
rem  Because Japanese comment lines start with "#", they are skipped
rem  before any codepage interpretation happens - so a UTF-8, a
rem  Shift-JIS or a CRLF .env all parse the same here.
rem  A UTF-16 .env ("Unicode" in Notepad) is NOT readable by cmd; that
rem  is what ENV_PORT_SRC below is for, so the caller can warn instead
rem  of silently starting on the wrong ports.
rem
rem  Sets: FRONTEND_PORT, BACKEND_PORT, ENV_PORT_SRC
rem    ENV_PORT_SRC = "env"     both ports came from .env
rem                   "none"    no .env file - defaults used
rem                   "partial" .env exists but the ports were not
rem                             found in it (wrong encoding? typo?)
rem ---------------------------------------------------------------
set "_ENV_ROOT=%~dp0..\"
set "FRONTEND_PORT="
set "BACKEND_PORT="
set "_ENV_HITS=0"
set "ENV_PORT_SRC=none"

if not exist "%_ENV_ROOT%.env" goto :_defaults

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%_ENV_ROOT%.env") do call :_set_kv "%%A" "%%B"

set "ENV_PORT_SRC=partial"
if "%_ENV_HITS%"=="2" set "ENV_PORT_SRC=env"

:_defaults
if not defined FRONTEND_PORT set "FRONTEND_PORT=5174"
if not defined BACKEND_PORT  set "BACKEND_PORT=8009"
set "_ENV_ROOT="
set "_ENV_HITS="
goto :eof

:_set_kv
rem Called once per line so that plain %VAR% expansion works
rem (no delayed expansion needed, which keeps "!" in values safe).
set "_K=%~1"
set "_V=%~2"
set "_K=%_K: =%"
set "_V=%_V: =%"

if /i "%_K%"=="FRONTEND_PORT" goto :_hit_front
if /i "%_K%"=="BACKEND_PORT"  goto :_hit_back

rem BOM tolerance. Notepad's "UTF-8 with BOM" glues 3 bytes onto the very
rem first line, so a .env that opens directly with a key arrives here as
rem "<BOM>FRONTEND_PORT" and the exact match above misses. Deleting the key
rem name from the string changes it only when the name is present, and what
rem is left over then has to be just the BOM - at most 3 characters.
set "_R=%_K:FRONTEND_PORT=%"
if not "%_R%"=="%_K%" if not "%_R%"=="" if "%_R:~3%"=="" goto :_hit_front
set "_R=%_K:BACKEND_PORT=%"
if not "%_R%"=="%_K%" if not "%_R%"=="" if "%_R:~3%"=="" goto :_hit_back
goto :_set_kv_done

:_hit_front
set "FRONTEND_PORT=%_V%"
set /a _ENV_HITS+=1
goto :_set_kv_done

:_hit_back
set "BACKEND_PORT=%_V%"
set /a _ENV_HITS+=1

:_set_kv_done
set "_K="
set "_V="
set "_R="
goto :eof
