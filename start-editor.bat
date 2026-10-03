@echo off
cd /d "%~dp0"

set PORT=8765

echo Starting Fourier Epicycle Editor on http://localhost:%PORT%
start "Fourier Editor Server" cmd /k "npx --yes serve -l %PORT% ."

timeout /t 3 /nobreak >nul
start http://localhost:%PORT%
