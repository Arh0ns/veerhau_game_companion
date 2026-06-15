@echo off
setlocal
set "ROOT=%~dp0"
set "PYTHON=C:\Users\vadim\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not defined CHRONICLE_PASSWORD set "CHRONICLE_PASSWORD=veerhau"
"%PYTHON%" "%ROOT%app.py"
