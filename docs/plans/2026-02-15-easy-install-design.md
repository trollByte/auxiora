# Easy Cross-Platform Installation Design

**Goal:** Every install path is a one-liner that ends with Auxiora running and the dashboard open in a browser. A user on any platform can go from zero to the setup wizard in under 2 minutes with a single command.

## Install Channels

| Channel | Command | Platforms |
|---------|---------|-----------|
| curl | `curl -fsSL https://get.auxiora.dev \| bash` | macOS, Linux |
| npm | `npx auxiora` or `npm i -g auxiora` | macOS, Linux, Windows |
| Docker | `docker run -d -p 18800:18800 -v auxiora-data:/data ghcr.io/auxiora/auxiora` | All |
| Homebrew | `brew install auxiora/tap/auxiora` | macOS, Linux |
| apt | `sudo apt install auxiora` (via PPA) | Debian/Ubuntu |

All channels lead to the same outcome: server running on port 18800, browser opens to dashboard setup wizard.

## Channel Details

### curl | bash
Polish existing `install.sh`:
- After install, auto-run `auxiora start` as a background process
- Auto-open browser to `http://localhost:18800/dashboard`
- Print clear success message with URL
- Host script at short URL (GitHub Pages or domain redirect)

### npm publish
- Publish `@auxiora/cli` to npm registry
- `bin.auxiora` entry already exists — `npx auxiora start` works
- Auto-open browser from `start` command
- Add postinstall message pointing to `auxiora start`

### Docker one-liner
- Image already builds and pushes to GHCR
- Add `latest` tag so version isn't required
- Add dashboard URL log line on startup
- Document the one-liner clearly

### Homebrew tap
- Create `auxiora/homebrew-tap` repo with Formula
- Formula downloads tarball from GitHub Releases (already built)
- `brew install auxiora/tap/auxiora` symlinks binary into PATH
- Release workflow auto-updates formula on new tags

### apt PPA
- Already build `.deb` packages with systemd service
- Create `auxiora/apt` repo using GitHub Pages as apt repository
- Release workflow pushes `.deb`, updates `Packages` index, GPG signs
- `sudo add-apt-repository ppa:auxiora/stable && sudo apt install auxiora`

## Auto-Open Browser Behavior

When `auxiora start` runs:
1. Server starts, binds to port 18800
2. Wait for health check to pass (server ready)
3. Auto-open `http://localhost:18800/dashboard` in default browser
4. First run: dashboard shows setup wizard. Already configured: shows chat view.

Rules:
- Only auto-open when run interactively (TTY detected)
- Skip when running as systemd service, Docker, or with `--no-browser` flag
- Docker prints URL instead: `Auxiora is ready at http://localhost:18800/dashboard`
- CLI `start` gets `--open` flag (default: true when TTY, false otherwise)

## Release Workflow Updates

Additions to existing `.github/workflows/release.yml`:

- **npm publish job** — publish `@auxiora/cli` after tests pass. Needs `NPM_TOKEN` secret.
- **Homebrew tap update** — push updated formula to `auxiora/homebrew-tap` with new tarball URL + SHA256. Needs `HOMEBREW_TAP_TOKEN` secret.
- **apt repo update** — upload `.deb` to GitHub Pages-based apt repo, update `Packages`/`Release` indexes, GPG sign.
- **Docker latest tag** — add `latest` tag push alongside version tags.

No changes to existing Tauri desktop build or tarball packaging.

## Out of Scope

- Windows-native installer (use npm, Docker, or Tauri desktop app)
- snap/flatpak (too much packaging overhead)
- Universal installer script (can add later as Approach B)
