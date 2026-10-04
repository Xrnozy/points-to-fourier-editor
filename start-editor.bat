@echo off
setlocal
cd /d "%~dp0"

set PORT=8765
set "NODE_PATH=%ProgramFiles%\nodejs"
set "PATH=%NODE_PATH%;%AppData%\npm;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Trying to install Node.js LTS...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Install Node.js from https://nodejs.org/ then run this file again.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo Could not install Node.js automatically. Install it from https://nodejs.org/
    pause
    exit /b 1
  )
  set "PATH=%NODE_PATH%;%AppData%\npm;%PATH%"
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js was installed but is not on PATH yet.
  echo Close this window, open a new one, and run start-editor.bat again.
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed.
  pause
  exit /b 1
)

echo.
echo Starting Fourier Epicycle Editor on http://localhost:%PORT%
start "Fourier Editor Server" cmd /k "cd /d "%~dp0" && npm start"

timeout /t 3 /nobreak >nul
start http://localhost:%PORT%
