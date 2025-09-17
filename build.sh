#!/usr/bin/env bash
# BYD Battery Box Visualization - local build helper
# Usage:
#   bash build.sh
#   # or (if executable): ./build.sh
#
# This will install dependencies when missing and then build the single-file
# Lovelace plugin: byd-battery-box-visualization.js

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

say() { echo -e "\033[1;34m[build]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" 1>&2; }

say "BYD Battery Box Visualization - local build"
say "Working directory: $ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Please install Node.js 18+ and retry."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm is not installed or not in PATH. Please install it and retry."
  exit 1
fi

# Install dependencies only if esbuild isn't present
if [ ! -d "node_modules/esbuild" ]; then
  say "Installing dependencies..."
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
else
  say "Dependencies already installed."
fi

say "Building bundle with esbuild..."
npm run -s build

OUT="byd-battery-box-visualization.js"
if [ -f "$OUT" ]; then
  SIZE_BYTES=$(wc -c < "$OUT" | tr -d ' ')
  if command -v awk >/dev/null 2>&1; then
    SIZE="$(awk -v b="$SIZE_BYTES" 'BEGIN{ printf "%.1f KB", b/1024 }')"
  else
    SIZE="${SIZE_BYTES} bytes"
  fi
  say "Build complete: $OUT ($SIZE)"
  exit 0
else
  err "Build failed: $OUT not found"
  exit 2
fi
