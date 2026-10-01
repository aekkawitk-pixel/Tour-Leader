@echo off
title Tour Leader System - dev server (localhost:4300)
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js from https://nodejs.org then try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo   Tour Leader System
echo   http://localhost:4300
echo.
echo   Keep this window OPEN. Closing it stops the server.
echo   Press Ctrl+C to stop.
echo.

start "" /min powershell -NoProfile -Command "1..120 | ForEach-Object { try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',4300); Start-Process 'http://localhost:4300'; exit } catch { Start-Sleep -Milliseconds 500 } }"

call npm run dev

echo.
echo Server stopped.
pause
