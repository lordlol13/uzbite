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

if not exist "%~dp0.env" (
  echo [UzBite] Initializing local .env...
  node "%~dp0scripts\setup-local.mjs"
  if errorlevel 1 (
    if /i not "%~1"=="--no-pause" pause
    exit /b 1
  )
)

if not exist "%~dp0node_modules\.prisma\client" (
  echo [UzBite] Generating Prisma Client...
  call npx prisma generate
  if errorlevel 1 (
    if /i not "%~1"=="--no-pause" pause
    exit /b 1
  )
)

set "EXE_UNPACKED=%~dp0apps\restaurant-desktop\release\win-unpacked\UzBite Restaurant.exe"
set "EXE_PORTABLE=%~dp0apps\restaurant-desktop\release\UzBite-Restaurant-1.0.0-portable.exe"

node -e "fetch('http://127.0.0.1:8081/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 1 (
  echo [UzBite] Starting PostgreSQL and Shared Backend API on port 8081...
  start "UzBite Backend Server (keep open)" /min cmd /c "npm run dev:server || (echo. & echo [UzBite] Backend server stopped with an error. & pause)"
  node -e "const d=Date.now()+90000;(async()=>{while(Date.now()<d){try{const r=await fetch('http://127.0.0.1:8081/api/health');if(r.ok){process.exit(0);}}catch{}await new Promise(r=>setTimeout(r,500));}process.exit(1);})()"
  if errorlevel 1 (
    echo [UzBite] Failed to reach http://127.0.0.1:8081/api/health. Check the server window.
    if /i not "%~1"=="--no-pause" pause
    exit /b 1
  )
)

if exist "%EXE_UNPACKED%" (
  start "" "%EXE_UNPACKED%"
) else if exist "%EXE_PORTABLE%" (
  start "" "%EXE_PORTABLE%"
) else (
  echo [UzBite] Packaged executable not found. Launching Electron dev mode...
  start "UzBite Restaurant Desktop" /min cmd /c "npm run desktop:restaurant || (echo. & echo [UzBite] Restaurant Desktop stopped with an error. & pause)"
)
