#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="2.0.0"
ARCH="amd64"
PKG_NAME="auxiora_${VERSION}_${ARCH}"
STAGING="$REPO_ROOT/dist/deb-staging/$PKG_NAME"
DEB_SRC="$REPO_ROOT/installers/deb"
OUTPUT="$REPO_ROOT/dist/${PKG_NAME}.deb"

echo "==> Building Auxiora TypeScript project..."
cd "$REPO_ROOT"
pnpm install --frozen-lockfile
pnpm run build

echo "==> Preparing staging directory..."
rm -rf "$STAGING"
mkdir -p "$STAGING"

# -- DEBIAN control files --
cp -r "$DEB_SRC/DEBIAN" "$STAGING/DEBIAN"
chmod 755 "$STAGING/DEBIAN/postinst" "$STAGING/DEBIAN/prerm"

# -- Application files under /opt/auxiora --
APP_DIR="$STAGING/opt/auxiora"
mkdir -p "$APP_DIR"

# Copy all built packages
cp -r "$REPO_ROOT/packages" "$APP_DIR/packages"
cp "$REPO_ROOT/package.json" "$APP_DIR/package.json"
cp "$REPO_ROOT/pnpm-workspace.yaml" "$APP_DIR/pnpm-workspace.yaml"
cp "$REPO_ROOT/pnpm-lock.yaml" "$APP_DIR/pnpm-lock.yaml"

# Install production dependencies only
cd "$APP_DIR"
pnpm install --frozen-lockfile --prod
cd "$REPO_ROOT"

# Remove source files and dev artifacts from the staging copy
find "$APP_DIR/packages" -type d -name src -exec rm -rf {} + 2>/dev/null || true
find "$APP_DIR/packages" -name 'tsconfig*.json' -delete 2>/dev/null || true
find "$APP_DIR/packages" -name '*.tsbuildinfo' -delete 2>/dev/null || true
find "$APP_DIR/packages" -type d -name tests -exec rm -rf {} + 2>/dev/null || true

# Create a wrapper script
mkdir -p "$APP_DIR/bin"
cat > "$APP_DIR/bin/auxiora" <<'WRAPPER'
#!/bin/bash
exec /usr/bin/env node /opt/auxiora/packages/cli/dist/index.js "$@"
WRAPPER
chmod 755 "$APP_DIR/bin/auxiora"

# -- Symlink in /usr/bin --
mkdir -p "$STAGING/usr/bin"
ln -sf /opt/auxiora/bin/auxiora "$STAGING/usr/bin/auxiora"

# -- Systemd service file --
mkdir -p "$STAGING/lib/systemd/system"
cp "$DEB_SRC/lib/systemd/system/auxiora.service" "$STAGING/lib/systemd/system/auxiora.service"

# -- Default config --
mkdir -p "$STAGING/etc/auxiora"
cp "$DEB_SRC/etc/auxiora/config.yaml" "$STAGING/etc/auxiora/config.yaml"

echo "==> Building .deb package..."
mkdir -p "$REPO_ROOT/dist"
dpkg-deb --build "$STAGING" "$OUTPUT"

echo "==> Package built: $OUTPUT"
echo "    Install with: sudo dpkg -i $OUTPUT"
