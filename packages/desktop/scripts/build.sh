#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$DESKTOP_DIR")")"

echo "Building Auxiora Desktop..."

# Build the dashboard frontend first
echo "Step 1: Building dashboard frontend..."
pnpm --filter @auxiora/dashboard-ui build

# Build the Tauri app
echo "Step 2: Building Tauri app..."
cd "$DESKTOP_DIR"
pnpm tauri build "$@"

echo "Build complete! Artifacts in: $DESKTOP_DIR/src-tauri/target/release/bundle/"
