#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DESKTOP_DIR="$ROOT_DIR/packages/desktop"
TAURI_DIR="$DESKTOP_DIR/src-tauri"

echo "=== Auxiora Desktop Build ==="
echo "Platform: $(uname -s)"
echo "Architecture: $(uname -m)"
echo ""

# Step 1: Build TypeScript packages
echo "[1/3] Building TypeScript packages..."
cd "$ROOT_DIR"
pnpm -r build

# Step 2: Build frontend for webview
echo "[2/3] Preparing webview assets..."
WEBVIEW_DIR="$DESKTOP_DIR/dist-webview"
mkdir -p "$WEBVIEW_DIR"
cp "$TAURI_DIR/index.html" "$WEBVIEW_DIR/index.html"

# Step 3: Build Tauri application
echo "[3/3] Building Tauri application..."
cd "$TAURI_DIR"

if ! command -v cargo &>/dev/null; then
  echo "Error: Rust toolchain not found. Install from https://rustup.rs"
  exit 1
fi

if [ "${CI:-}" = "true" ]; then
  cargo tauri build
else
  cargo tauri build --debug
fi

echo ""
echo "=== Build complete ==="
echo "Artifacts in: $TAURI_DIR/target/"
