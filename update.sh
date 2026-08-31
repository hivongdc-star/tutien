#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

INSTALL_FLAG="${1:-}"

echo "[1/4] Fetch origin/main..."
git fetch --prune origin main

echo "[2/4] Sync working tree to origin/main..."
# Production server luôn chạy đúng code trên main.
# Runtime data (.env, users.json, battu profiles, logs...) đã được .gitignore bảo vệ.
git reset --hard HEAD
git checkout -B main origin/main
git reset --hard origin/main

if [[ "$INSTALL_FLAG" == "--no-install" ]]; then
  echo "[3/4] Skip npm install (--no-install)"
else
  echo "[3/4] Install production dependencies..."
  # Không phụ thuộc package-lock cũ; không ghi lại lockfile trên server.
  npm install --omit=dev --no-audit --no-fund --package-lock=false
fi

echo "[4/4] Done. Supervisor/PM2 will restart the bot after process exit."
