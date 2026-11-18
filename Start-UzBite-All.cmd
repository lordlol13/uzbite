@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [UzBite] Node.js not found in PATH. Install Node.js 22.12+ and try again.
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)

if not exist "%~dp0node_modules" (
  echo [UzBite] Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo [UzBite] npm install failed.
    if /i not "%~1"=="--no-pause" pause
    exit /b 1
  )
)

node "%~dp0scripts\start-all.mjs"
if errorlevel 1 (
  echo.
  echo [UzBite] Startup failed. Check the messages above.
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)

if /i not "%~1"=="--no-pause" pause
