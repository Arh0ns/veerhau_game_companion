@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=C:\Users\vadim\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%ROOT%.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%.env") do (
    if /i "%%A"=="CHRONICLE_PASSWORD" set "CHRONICLE_PASSWORD=%%B"
  )
)
if not defined CHRONICLE_PASSWORD set "CHRONICLE_PASSWORD=veerhau"
set "CHRONICLE_HOST=127.0.0.1"
set "CHRONICLE_PORT=8787"
set "CHRONICLE_DATA_DIR=%ROOT%data"
if not exist "%ROOT%logs" mkdir "%ROOT%logs"
"%PYTHON%" "%ROOT%app.py" 1>> "%ROOT%logs\local-app.cmd.out.log" 2>> "%ROOT%logs\local-app.cmd.err.log"
