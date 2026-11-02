@echo off
set "ROOT=%~dp0"
if not exist "%ROOT%portable\server.mjs" set "ROOT=%ROOT%..\"
cd /d "%ROOT%"
if not exist "%ROOT%node.exe" (
  echo 找不到內附的 Node.js 執行檔，請重新解壓完整封裝包。
  pause
  exit /b 1
)
"%ROOT%node.exe" "%ROOT%portable\server.mjs"
if errorlevel 1 pause
