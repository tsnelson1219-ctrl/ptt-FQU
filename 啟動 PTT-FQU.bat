@echo off
chcp 65001 >nul
title PTT-FQU 啟動器
cd /d "%~dp0"
if not exist "%~dp0node.exe" goto nonode
echo 正在啟動 PTT-FQU 本地伺服器...
echo 視窗載入完成後可將此視窗最小化（關閉此視窗會停止 PTT 服務）。
"%~dp0node.exe" "%~dp0portable\server.mjs"
echo.
echo PTT-FQU 已結束（結束代碼 %errorlevel%）。若上方有錯誤訊息，請複製或截圖。
echo 詳細紀錄請看同目錄的 ptt-fqu.log
pause
exit /b
:nonode
echo [錯誤] 找不到 node.exe，請確認已解壓縮完整資料夾。
pause
exit /b 1
