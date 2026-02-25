#!/usr/bin/env bash
# update-repo.sh — Update the apt repository with a new .deb package
# Usage: ./update-repo.sh <path-to-deb> <repo-dir>
set -euo pipefail

DEB_FILE="$1"
REPO_DIR="${2:-.}"

# Create directory structure
mkdir -p "$REPO_DIR/pool/main"
mkdir -p "$REPO_DIR/dists/stable/main/binary-amd64"

# Copy .deb to pool
cp "$DEB_FILE" "$REPO_DIR/pool/main/"

# Generate Packages index
cd "$REPO_DIR"
dpkg-scanpackages pool/main /dev/null > dists/stable/main/binary-amd64/Packages
gzip -9c dists/stable/main/binary-amd64/Packages > dists/stable/main/binary-amd64/Packages.gz

# Generate Release file
cd dists/stable
cat > Release <<EOF
Origin: Auxiora
Label: Auxiora
Suite: stable
Codename: stable
Architectures: amd64
Components: main
Description: Auxiora self-hosted AI assistant
$(apt-ftparchive release .)
EOF

# GPG sign if key available
if [ -n "${GPG_KEY_ID:-}" ]; then
    gpg --default-key "$GPG_KEY_ID" -abs -o Release.gpg Release
    gpg --default-key "$GPG_KEY_ID" --clearsign -o InRelease Release
fi

echo "Apt repository updated successfully."
