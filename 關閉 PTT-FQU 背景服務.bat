@echo off
chcp 65001 >nul
echo 正在停止 PTT-FQU 本地服務 (Port 38120)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":38120 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo PTT-FQU 本機服務已停止。
timeout /t 2 >nul
