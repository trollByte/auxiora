#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$ROOT_DIR/packages/desktop/src-tauri"
TARGET_DIR="$TAURI_DIR/target/release/bundle"

echo "=== Auxiora Desktop Code Signing ==="

PLATFORM="$(uname -s)"

case "$PLATFORM" in
  Darwin)
    echo "Platform: macOS"

    if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
      echo "Error: APPLE_SIGNING_IDENTITY not set"
      echo "Set to your Developer ID Application certificate name"
      exit 1
    fi

    DMG_PATH=$(find "$TARGET_DIR/dmg" -name "*.dmg" 2>/dev/null | head -1)
    APP_PATH=$(find "$TARGET_DIR/macos" -name "*.app" 2>/dev/null | head -1)

    if [ -n "$APP_PATH" ]; then
      echo "Signing: $APP_PATH"
      codesign --deep --force --verify --verbose \
        --sign "$APPLE_SIGNING_IDENTITY" \
        --options runtime \
        "$APP_PATH"
      echo "App signed."
    fi

    if [ -n "$DMG_PATH" ]; then
      echo "Signing DMG: $DMG_PATH"
      codesign --force --verify --verbose \
        --sign "$APPLE_SIGNING_IDENTITY" \
        "$DMG_PATH"
      echo "DMG signed."
    fi

    # Notarize if credentials are available
    if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
      echo "Submitting for notarization..."
      ARTIFACT="${DMG_PATH:-$APP_PATH}"
      if [ -n "$ARTIFACT" ]; then
        xcrun notarytool submit "$ARTIFACT" \
          --apple-id "$APPLE_ID" \
          --team-id "$APPLE_TEAM_ID" \
          --password "${APPLE_APP_PASSWORD:-}" \
          --wait
        echo "Notarization complete."
      fi
    else
      echo "Skipping notarization (APPLE_ID / APPLE_TEAM_ID not set)"
    fi
    ;;

  MINGW*|MSYS*|CYGWIN*)
    echo "Platform: Windows"

    if [ -z "${WINDOWS_CERTIFICATE_FILE:-}" ]; then
      echo "Error: WINDOWS_CERTIFICATE_FILE not set"
      exit 1
    fi

    MSI_PATH=$(find "$TARGET_DIR/msi" -name "*.msi" 2>/dev/null | head -1)
    NSIS_PATH=$(find "$TARGET_DIR/nsis" -name "*.exe" 2>/dev/null | head -1)

    for ARTIFACT in "$MSI_PATH" "$NSIS_PATH"; do
      if [ -n "$ARTIFACT" ] && [ -f "$ARTIFACT" ]; then
        echo "Signing: $ARTIFACT"
        signtool sign /f "$WINDOWS_CERTIFICATE_FILE" \
          /p "${WINDOWS_CERTIFICATE_PASSWORD:-}" \
          /tr http://timestamp.digicert.com \
          /td sha256 /fd sha256 \
          "$ARTIFACT"
        echo "Signed: $ARTIFACT"
      fi
    done
    ;;

  Linux)
    echo "Platform: Linux"
    echo "Linux packages do not require code signing."
    echo "For distribution, use GPG signing on the release artifacts."

    if [ -n "${GPG_KEY_ID:-}" ]; then
      for ARTIFACT in "$TARGET_DIR"/deb/*.deb "$TARGET_DIR"/appimage/*.AppImage; do
        if [ -f "$ARTIFACT" ]; then
          echo "GPG signing: $ARTIFACT"
          gpg --detach-sign --armor --local-user "$GPG_KEY_ID" "$ARTIFACT"
          echo "Signed: $ARTIFACT.asc"
        fi
      done
    else
      echo "Skipping GPG signing (GPG_KEY_ID not set)"
    fi
    ;;

  *)
    echo "Error: Unsupported platform: $PLATFORM"
    exit 1
    ;;
esac

echo ""
echo "=== Signing complete ==="
