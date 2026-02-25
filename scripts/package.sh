#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# package.sh — Build Auxiora and produce a portable tarball
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION="${VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"

# Detect OS and architecture
detect_os() {
  local uname_s
  uname_s="$(uname -s)"
  case "$uname_s" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

detect_arch() {
  local uname_m
  uname_m="$(uname -m)"
  case "$uname_m" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l)        echo "armv7" ;;
    *)             echo "$uname_m" ;;
  esac
}

OS="${TARGET_OS:-$(detect_os)}"
ARCH="${TARGET_ARCH:-$(detect_arch)}"
ARTIFACT_NAME="auxiora-${VERSION}-${OS}-${ARCH}"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/${ARTIFACT_NAME}"

echo "=== Auxiora Packaging ==="
echo "Version:      $VERSION"
echo "Platform:     ${OS}-${ARCH}"
echo "Output:       ${DIST_DIR}/${ARTIFACT_NAME}.tar.gz"
echo ""

# ---- Step 1: Build all TypeScript packages --------------------------------
echo "[1/4] Building TypeScript packages..."
cd "$ROOT_DIR"
pnpm -r build

# ---- Step 2: Prepare staging directory ------------------------------------
echo "[2/4] Preparing staging directory..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/bin"
mkdir -p "$STAGE_DIR/packages"

# Copy root manifests needed by pnpm
cp "$ROOT_DIR/package.json" "$STAGE_DIR/"
cp "$ROOT_DIR/pnpm-lock.yaml" "$STAGE_DIR/"
cp "$ROOT_DIR/pnpm-workspace.yaml" "$STAGE_DIR/"

# Copy each package (source + built dist)
for pkg_dir in "$ROOT_DIR"/packages/*/; do
  pkg_name="$(basename "$pkg_dir")"
  dest="$STAGE_DIR/packages/$pkg_name"
  mkdir -p "$dest"

  # Copy package.json
  if [ -f "$pkg_dir/package.json" ]; then
    cp "$pkg_dir/package.json" "$dest/"
  fi

  # Copy built output
  if [ -d "$pkg_dir/dist" ]; then
    cp -r "$pkg_dir/dist" "$dest/"
  fi

  # Copy any native addons / assets
  for extra in binding.gyp prebuilds assets; do
    if [ -e "$pkg_dir/$extra" ]; then
      cp -r "$pkg_dir/$extra" "$dest/"
    fi
  done
done

# Handle nested workspace (dashboard/ui)
if [ -d "$ROOT_DIR/packages/dashboard/ui" ]; then
  dest="$STAGE_DIR/packages/dashboard/ui"
  mkdir -p "$dest"
  if [ -f "$ROOT_DIR/packages/dashboard/ui/package.json" ]; then
    cp "$ROOT_DIR/packages/dashboard/ui/package.json" "$dest/"
  fi
  if [ -d "$ROOT_DIR/packages/dashboard/ui/dist" ]; then
    cp -r "$ROOT_DIR/packages/dashboard/ui/dist" "$dest/"
  fi
fi

# ---- Step 3: Install production dependencies -----------------------------
echo "[3/4] Installing production dependencies..."
cd "$STAGE_DIR"
# Use corepack to ensure pnpm is available
if command -v corepack &>/dev/null; then
  corepack enable 2>/dev/null || true
fi
pnpm install --frozen-lockfile --prod --ignore-scripts 2>/dev/null || \
  pnpm install --prod --ignore-scripts

# ---- Step 4: Create wrapper script and tarball ----------------------------
echo "[4/4] Creating tarball..."

# Create the bin/auxiora wrapper
cat > "$STAGE_DIR/bin/auxiora" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
AUXIORA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$AUXIORA_ROOT/packages/cli/dist/index.js" "$@"
WRAPPER
chmod +x "$STAGE_DIR/bin/auxiora"

# Create the tarball
cd "$DIST_DIR"
tar czf "${ARTIFACT_NAME}.tar.gz" "$ARTIFACT_NAME"
rm -rf "$STAGE_DIR"

TARBALL_SIZE="$(du -h "${DIST_DIR}/${ARTIFACT_NAME}.tar.gz" | cut -f1)"

echo ""
echo "=== Packaging complete ==="
echo "Tarball: ${DIST_DIR}/${ARTIFACT_NAME}.tar.gz (${TARBALL_SIZE})"
echo ""
echo "Usage:"
echo "  tar xzf ${ARTIFACT_NAME}.tar.gz"
echo "  ./${ARTIFACT_NAME}/bin/auxiora start"
echo ""
echo "Docker build:"
echo "  docker build -f deploy/docker/Dockerfile -t auxiora:${VERSION} ."
