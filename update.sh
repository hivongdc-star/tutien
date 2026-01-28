#!/usr/bin/env bash
set -euo pipefail

# chạy ở đúng thư mục repo (nơi đặt file update.sh)
cd "$(dirname "$0")"

echo "[1/4] git pull..."
git pull

PATCH_FILE="${1:-}"
INSTALL_FLAG="${2:-}"

# Cho phép gọi: ./update.sh --install  (không patch)
# hoặc:         ./update.sh <patch> --install
# hoặc:         ./update.sh --no-install
if [[ "$PATCH_FILE" == "--install" || "$PATCH_FILE" == "--no-install" ]]; then
  INSTALL_FLAG="$PATCH_FILE"
  PATCH_FILE=""
fi

if [[ -n "$PATCH_FILE" ]]; then
  echo "[2/4] git apply $PATCH_FILE..."
  git apply "$PATCH_FILE"
else
  echo "[2/4] skip patch"
fi

# Mặc định: luôn install (npm ci) trừ khi có --no-install
if [[ "$INSTALL_FLAG" == "--no-install" ]]; then
  echo "[3/4] skip npm ci (--no-install)"
else
  echo "[3/4] npm ci..."
  npm ci
fi

echo "[4/4] done (bot sẽ tự restart bằng supervisor/pm2 khi process thoát)"
