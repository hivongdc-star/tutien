@echo off
setlocal enableextensions

REM chạy ở đúng thư mục repo (nơi đặt file update.bat)
cd /d "%~dp0"

echo [1/4] git pull...
git pull
if errorlevel 1 exit /b 1

set PATCH_FILE=%~1
set INSTALL_FLAG=%~2

REM Cho phép gọi: update.bat --install (không patch)
REM hoặc:         update.bat <patch> --install
REM hoặc:         update.bat --no-install
if /i "%PATCH_FILE%"=="--install" (
  set INSTALL_FLAG=%PATCH_FILE%
  set PATCH_FILE=
)
if /i "%PATCH_FILE%"=="--no-install" (
  set INSTALL_FLAG=%PATCH_FILE%
  set PATCH_FILE=
)

if not "%PATCH_FILE%"=="" (
  echo [2/4] git apply "%PATCH_FILE%"...
  git apply "%PATCH_FILE%"
  if errorlevel 1 exit /b 2
) else (
  echo [2/4] skip patch
)

REM Mặc định: luôn install (npm ci) trừ khi có --no-install
if /i "%INSTALL_FLAG%"=="--no-install" (
  echo [3/4] skip npm ci (--no-install)
) else (
  echo [3/4] npm ci...
  call npm ci
  if errorlevel 1 exit /b 3
)

echo [4/4] done (bot sẽ tự restart bằng supervisor/pm2 khi process thoát)
exit /b 0
