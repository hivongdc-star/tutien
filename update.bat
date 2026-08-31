@echo off
setlocal enableextensions

cd /d "%~dp0"
set INSTALL_FLAG=%~1

echo [1/4] Fetch origin/main...
git fetch --prune origin main
if errorlevel 1 exit /b 1

echo [2/4] Sync working tree to origin/main...
REM Production server luôn chạy đúng code trên main.
REM Runtime data (.env, users.json, battu profiles, logs...) đã được .gitignore bảo vệ.
git reset --hard HEAD
if errorlevel 1 exit /b 2
git checkout -B main origin/main
if errorlevel 1 exit /b 2
git reset --hard origin/main
if errorlevel 1 exit /b 2

if /i "%INSTALL_FLAG%"=="--no-install" (
  echo [3/4] Skip npm install (--no-install)
) else (
  echo [3/4] Install production dependencies...
  REM Không phụ thuộc package-lock cũ; không ghi lại lockfile trên server.
  call npm install --omit=dev --no-audit --no-fund --package-lock=false
  if errorlevel 1 exit /b 3
)

echo [4/4] Done. Supervisor/PM2 will restart the bot after process exit.
exit /b 0
