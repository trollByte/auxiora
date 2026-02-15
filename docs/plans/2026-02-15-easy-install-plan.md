# Easy Cross-Platform Installation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every install path is a one-liner that ends with Auxiora running and the dashboard open in a browser.

**Architecture:** Polish existing install infrastructure (install.sh, Docker, CLI, release workflow) by adding auto-open browser behavior to the CLI `start` command, publishing to npm, creating a Homebrew tap formula, setting up an apt repository, and updating the release workflow to publish to all channels automatically.

**Tech Stack:** Node.js 22, Commander.js, GitHub Actions, Homebrew Ruby DSL, dpkg/apt

---

### Task 1: Add auto-open browser to CLI start command

**Files:**
- Modify: `packages/cli/src/commands/start.ts`
- Modify: `packages/cli/package.json` (add `open` dependency)

**Context:** The `start` command in `packages/cli/src/commands/start.ts` already detects TTY via `process.stdin.isTTY`. After the server starts, we need to auto-open the browser. Use the `open` npm package (cross-platform: macOS `open`, Linux `xdg-open`, Windows `start`).

**Step 1: Install the `open` package**

Run: `pnpm -C packages/cli add open@^10.0.0`

**Step 2: Add browser-open logic to start.ts**

In `packages/cli/src/commands/start.ts`, after the `startAuxiora()` call succeeds:

```typescript
import open from 'open';

// After startAuxiora() resolves successfully:
const port = process.env.AUXIORA_GATEWAY_PORT || '18800';
const dashboardUrl = `http://localhost:${port}/dashboard`;

console.log(`\n  Auxiora is running at: ${dashboardUrl}\n`);

// Auto-open browser if interactive TTY and not explicitly disabled
if (process.stdin.isTTY && !process.env.AUXIORA_NO_BROWSER) {
  try {
    await open(dashboardUrl);
  } catch {
    // Non-fatal — user can open manually
  }
}
```

Also add a `--no-browser` option to the command:

```typescript
.option('--no-browser', 'do not auto-open browser')
```

And check it:

```typescript
if (process.stdin.isTTY && !process.env.AUXIORA_NO_BROWSER && options.browser !== false) {
```

**Step 3: Build and verify**

Run: `pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/start.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): auto-open browser on start when running interactively"
```

---

### Task 2: Add dashboard URL log to Docker startup

**Files:**
- Modify: `packages/cli/src/commands/start.ts`

**Context:** In Docker (non-TTY), the browser won't auto-open. But we should print a clear, visible URL message so users know where to go. The TTY detection from Task 1 already skips browser opening for Docker. We just need to make the log message prominent in non-TTY mode too.

**Step 1: Update the startup log for non-TTY mode**

In `packages/cli/src/commands/start.ts`, ensure the URL message always prints regardless of TTY:

```typescript
const port = process.env.AUXIORA_GATEWAY_PORT || '18800';
const host = process.env.AUXIORA_GATEWAY_HOST || 'localhost';
const dashboardUrl = `http://localhost:${port}/dashboard`;

console.log('');
console.log('  ╔══════════════════════════════════════════════╗');
console.log(`  ║  Auxiora is running!                         ║`);
console.log(`  ║  Dashboard: ${dashboardUrl.padEnd(33)}║`);
console.log('  ╚══════════════════════════════════════════════╝');
console.log('');
```

This prints for all environments. The auto-open only fires for TTY.

**Step 2: Build and verify**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/commands/start.ts
git commit -m "feat(cli): add prominent dashboard URL banner on startup"
```

---

### Task 3: Polish install.sh with auto-start and auto-open

**Files:**
- Modify: `scripts/install.sh`

**Context:** The current `install.sh` (v2.0.0) ends after installation with a message telling the user to run `auxiora start`. We need to add auto-start + auto-open at the end.

**Step 1: Add auto-start section at the end of install.sh**

Find the success message at the end of the script (after the `verify_installation` function call) and add:

```bash
# ── Auto-start ───────────────────────────────────────────────
log ""
log "Starting Auxiora..."
log ""

# Start in background, auto-open browser
if command -v auxiora &>/dev/null; then
    auxiora start &
    AUXIORA_PID=$!

    # Wait for health check
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:${AUXIORA_PORT:-18800}/health" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    log "Auxiora is running! Opening dashboard..."

    # Open browser
    DASHBOARD_URL="http://localhost:${AUXIORA_PORT:-18800}/dashboard"
    if command -v open &>/dev/null; then
        open "$DASHBOARD_URL"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$DASHBOARD_URL"
    else
        log "Open your browser to: $DASHBOARD_URL"
    fi
else
    warn "Could not find auxiora in PATH. Run: auxiora start"
fi
```

**Step 2: Test the script locally**

Run: `bash scripts/install.sh --help`
Expected: Shows usage info without errors

**Step 3: Commit**

```bash
git add scripts/install.sh
git commit -m "feat(install): auto-start and auto-open browser after installation"
```

---

### Task 4: Prepare CLI package for npm publishing

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/.npmignore`

**Context:** The `@auxiora/cli` package needs to be publishable to npm. Currently the monorepo root is `private: true` but the CLI package itself doesn't have `private: true`. We need to ensure: correct metadata, files list, and an `.npmignore`.

**Step 1: Update packages/cli/package.json**

Add/update these fields:

```json
{
  "name": "auxiora",
  "description": "Self-hosted AI assistant — install and run with a single command",
  "keywords": ["ai", "assistant", "self-hosted", "chatbot", "llm"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/auxiora/auxiora.git",
    "directory": "packages/cli"
  },
  "homepage": "https://auxiora.dev",
  "files": [
    "dist/",
    "bin/"
  ]
}
```

**Important:** Change `"name"` from `"@auxiora/cli"` to `"auxiora"` so users can run `npx auxiora` (not `npx @auxiora/cli`). This is the public package name.

**Step 2: Create .npmignore**

Create `packages/cli/.npmignore`:

```
src/
tests/
tsconfig*.json
*.tsbuildinfo
.eslintrc*
```

**Step 3: Verify package contents**

Run: `cd packages/cli && npm pack --dry-run`
Expected: Lists only dist/, bin/, package.json, README, LICENSE

**Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/.npmignore
git commit -m "feat(cli): prepare package for npm publishing as 'auxiora'"
```

---

### Task 5: Create Homebrew tap formula

**Files:**
- Create: `deploy/homebrew/auxiora.rb`

**Context:** Homebrew formulae are Ruby files that describe how to install a package. The formula downloads the tarball from GitHub Releases, extracts it, and links the binary. We create the formula locally in `deploy/homebrew/` — the release workflow will push it to the `auxiora/homebrew-tap` repo.

**Step 1: Create the formula**

Create `deploy/homebrew/auxiora.rb`:

```ruby
class Auxiora < Formula
  desc "Self-hosted AI assistant"
  homepage "https://github.com/auxiora/auxiora"
  version "VERSION_PLACEHOLDER"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-darwin-arm64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_DARWIN_ARM64"
    else
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-darwin-x64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-linux-arm64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_LINUX_ARM64"
    else
      url "https://github.com/auxiora/auxiora/releases/download/v#{version}/auxiora-#{version}-linux-x64.tar.gz"
      sha256 "SHA256_PLACEHOLDER_LINUX_X64"
    end
  end

  depends_on "node@22"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/auxiora"
  end

  test do
    assert_match "auxiora", shell_output("#{bin}/auxiora --version")
  end
end
```

**Step 2: Commit**

```bash
git add deploy/homebrew/auxiora.rb
git commit -m "feat(homebrew): add Homebrew tap formula template"
```

---

### Task 6: Create apt repository structure

**Files:**
- Create: `deploy/apt/update-repo.sh`

**Context:** GitHub Pages can serve as an apt repository. We need a script that takes a `.deb` file, adds it to a `pool/` directory, generates `Packages` and `Release` index files, and optionally GPG-signs them. The release workflow will run this script and push to the `auxiora/apt` repo.

**Step 1: Create the apt repo update script**

Create `deploy/apt/update-repo.sh`:

```bash
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
```

**Step 2: Make executable**

Run: `chmod +x deploy/apt/update-repo.sh`

**Step 3: Commit**

```bash
git add deploy/apt/update-repo.sh
git commit -m "feat(apt): add apt repository update script"
```

---

### Task 7: Update release workflow — npm publish

**Files:**
- Modify: `.github/workflows/release.yml`

**Context:** Add a new job after `test` that publishes the CLI package to npm. Requires `NPM_TOKEN` secret in the repo.

**Step 1: Add npm-publish job**

Add after the `test` job in `.github/workflows/release.yml`:

```yaml
  npm-publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: cd packages/cli && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add npm publish job to release workflow"
```

---

### Task 8: Update release workflow — Homebrew tap

**Files:**
- Modify: `.github/workflows/release.yml`

**Context:** After the release is created and tarballs are uploaded, update the Homebrew formula in the `auxiora/homebrew-tap` repo with the correct version and SHA256 hashes. Uses `HOMEBREW_TAP_TOKEN` secret (a PAT with repo scope on the tap repo).

**Step 1: Add homebrew-update job**

Add after the `release` job:

```yaml
  homebrew-update:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Download tarball artifacts
        uses: actions/download-artifact@v4
        with:
          name: server-packages
          path: artifacts/

      - name: Update Homebrew formula
        env:
          TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"

          # Calculate SHA256 for each tarball
          SHA_LINUX_X64=$(sha256sum artifacts/auxiora-${VERSION}-linux-x64.tar.gz | cut -d' ' -f1)

          # Read template and replace placeholders
          FORMULA=$(cat deploy/homebrew/auxiora.rb)
          FORMULA="${FORMULA//VERSION_PLACEHOLDER/$VERSION}"
          FORMULA="${FORMULA//SHA256_PLACEHOLDER_LINUX_X64/$SHA_LINUX_X64}"

          # Clone tap repo and update formula
          git clone "https://x-access-token:${TAP_TOKEN}@github.com/auxiora/homebrew-tap.git" tap
          mkdir -p tap/Formula
          echo "$FORMULA" > tap/Formula/auxiora.rb

          cd tap
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Formula/auxiora.rb
          git commit -m "Update auxiora to ${VERSION}"
          git push
```

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add Homebrew tap update job"
```

---

### Task 9: Update release workflow — apt repo + Docker latest tag

**Files:**
- Modify: `.github/workflows/release.yml`

**Context:** Two additions: (1) push .deb to the apt repo, (2) ensure Docker pushes a `latest` tag. The Docker `latest` tag may already exist in the workflow — verify and add if missing.

**Step 1: Add apt-update job**

Add after the `release` job:

```yaml
  apt-update:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Download deb artifact
        uses: actions/download-artifact@v4
        with:
          name: server-packages
          path: artifacts/

      - name: Update apt repository
        env:
          APT_TOKEN: ${{ secrets.APT_REPO_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          DEB_FILE=$(ls artifacts/*.deb | head -1)

          git clone "https://x-access-token:${APT_TOKEN}@github.com/auxiora/apt.git" apt-repo
          bash deploy/apt/update-repo.sh "$DEB_FILE" apt-repo

          cd apt-repo
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -m "Update auxiora to ${VERSION}"
          git push
```

**Step 2: Verify Docker latest tag**

Check the Docker job in the release workflow. The `docker/metadata-action` tags section should include `type=raw,value=latest`. If not, add it to the tags list.

**Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add apt repo update and verify Docker latest tag"
```

---

### Task 10: Build, test, push

**Step 1: Build everything**

Run: `pnpm build`
Expected: PASS

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Build dashboard UI**

Run: `cd packages/dashboard/ui && npx vite build --outDir ../dist-ui --emptyOutDir`

**Step 4: Commit built assets and push**

```bash
git add packages/dashboard/dist-ui/
git commit -m "build(dashboard): rebuild UI assets"
git push origin main
```
