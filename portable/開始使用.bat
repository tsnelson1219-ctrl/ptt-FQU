@echo off
chcp 65001 >nul
for %%I in ("%~dp0.") do set "ROOT=%%~fI"
if not exist "%ROOT%\portable\server.mjs" for %%I in ("%ROOT%\..") do set "ROOT=%%~fI"
cd /d "%ROOT%"
if not exist "%ROOT%\node.exe" (
  echo Missing bundled node.exe. Extract the complete ZIP and try again.
  pause
  exit /b 1
)
"%ROOT%\node.exe" "%ROOT%\portable\server.mjs"
echo.
echo PTT-FQU has stopped. Press any key to close this window.
pause >nul
