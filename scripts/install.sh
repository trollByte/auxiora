#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# install.sh — Install Auxiora on Linux or macOS
# ---------------------------------------------------------------------------

VERSION="2.0.0"
RELEASE_URL="https://github.com/auxiora/auxiora/releases/download/v${VERSION}"
MIN_NODE_MAJOR=22

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' RESET=''
fi

info()    { printf "${BLUE}[*]${RESET} %s\n" "$*"; }
success() { printf "${GREEN}[+]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[!]${RESET} %s\n" "$*"; }
error()   { printf "${RED}[x]${RESET} %s\n" "$*" >&2; }
fatal()   { error "$*"; exit 1; }

NON_INTERACTIVE=0
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Detect platform
# ---------------------------------------------------------------------------
detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       fatal "Unsupported operating system: $(uname -s). Use install.ps1 for Windows." ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l)        echo "armv7" ;;
    *)             fatal "Unsupported architecture: $(uname -m)" ;;
  esac
}

detect_distro() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  elif command -v sw_vers &>/dev/null; then
    echo "macos"
  else
    echo "unknown"
  fi
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
DISTRO="$(detect_distro)"

# Installation paths
if [ "$(id -u)" -eq 0 ]; then
  INSTALL_DIR="/opt/auxiora"
  BIN_LINK="/usr/local/bin/auxiora"
else
  INSTALL_DIR="${HOME}/.local/share/auxiora"
  BIN_LINK="${HOME}/.local/bin/auxiora"
fi

TARBALL_NAME="auxiora-${VERSION}-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="${RELEASE_URL}/${TARBALL_NAME}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
command_exists() { command -v "$1" &>/dev/null; }

download() {
  local url="$1" dest="$2"
  if command_exists curl; then
    curl -fSL --progress-bar -o "$dest" "$url"
  elif command_exists wget; then
    wget --show-progress -q -O "$dest" "$url"
  else
    fatal "Neither curl nor wget found. Install one and retry."
  fi
}

confirm() {
  local prompt="$1"
  printf "${BOLD}%s [y/N]${RESET} " "$prompt"
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

node_version_major() {
  if command_exists node; then
    node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo "0"
  else
    echo "0"
  fi
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
do_uninstall() {
  info "Uninstalling Auxiora..."

  local found=false

  # Remove install directory
  for dir in /opt/auxiora "${HOME}/.local/share/auxiora"; do
    if [ -d "$dir" ]; then
      info "Removing $dir"
      rm -rf "$dir"
      found=true
    fi
  done

  # Remove symlinks
  for link in /usr/local/bin/auxiora "${HOME}/.local/bin/auxiora"; do
    if [ -L "$link" ]; then
      info "Removing symlink $link"
      rm -f "$link"
      found=true
    fi
  done

  if $found; then
    success "Auxiora has been uninstalled."
  else
    warn "Auxiora does not appear to be installed."
  fi
  exit 0
}

# ---------------------------------------------------------------------------
# Node.js installation
# ---------------------------------------------------------------------------
install_node() {
  info "Node.js >= ${MIN_NODE_MAJOR} is required but not found."

  if ! confirm "Would you like to install Node.js ${MIN_NODE_MAJOR}?"; then
    fatal "Node.js >= ${MIN_NODE_MAJOR} is required. Install it manually and re-run this script."
  fi

  case "$DISTRO" in
    ubuntu|debian|pop|linuxmint|elementary)
      info "Installing Node.js ${MIN_NODE_MAJOR} via NodeSource (apt)..."
      if [ "$(id -u)" -ne 0 ]; then
        fatal "Root privileges are required to install Node.js via apt. Run with sudo or install Node.js manually."
      fi
      curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
      apt-get install -y nodejs
      ;;
    fedora|rhel|centos|rocky|alma|ol)
      info "Installing Node.js ${MIN_NODE_MAJOR} via NodeSource (rpm)..."
      if [ "$(id -u)" -ne 0 ]; then
        fatal "Root privileges are required to install Node.js via yum/dnf. Run with sudo or install Node.js manually."
      fi
      curl -fsSL "https://rpm.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
      if command_exists dnf; then
        dnf install -y nodejs
      else
        yum install -y nodejs
      fi
      ;;
    macos)
      if command_exists brew; then
        info "Installing Node.js ${MIN_NODE_MAJOR} via Homebrew..."
        brew install "node@${MIN_NODE_MAJOR}"
        brew link --overwrite "node@${MIN_NODE_MAJOR}"
      else
        fatal "Homebrew not found. Install Homebrew (https://brew.sh) or Node.js manually."
      fi
      ;;
    *)
      fatal "Automatic Node.js installation is not supported for '${DISTRO}'. Install Node.js >= ${MIN_NODE_MAJOR} manually."
      ;;
  esac

  # Verify
  if [ "$(node_version_major)" -lt "$MIN_NODE_MAJOR" ]; then
    fatal "Node.js installation succeeded but version is still below ${MIN_NODE_MAJOR}. Check your PATH."
  fi

  success "Node.js $(node --version) installed."
}

# ---------------------------------------------------------------------------
# Interactive provider setup
# ---------------------------------------------------------------------------
prompt_provider() {
  [ "$NON_INTERACTIVE" = "1" ] && return

  echo ""
  printf "${BOLD}AI Provider Setup${RESET}\n"
  printf "Auxiora needs an AI provider. You can configure this later in the dashboard.\n\n"

  if command_exists curl && curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
    printf "${GREEN}✓ Ollama detected on this system!${RESET}\n"
    printf "Use Ollama as your AI provider? [Y/n] "
    read -r use_ollama
    if [ "$use_ollama" != "n" ] && [ "$use_ollama" != "N" ]; then
      PROVIDER="ollama"
      return
    fi
  fi

  printf "Do you have an API key for an AI provider? [y/N] "
  read -r has_key
  if [ "$has_key" != "y" ] && [ "$has_key" != "Y" ]; then
    printf "No problem — configure a provider in the dashboard later.\n"
    return
  fi

  printf "\nWhich provider?\n"
  printf "  1) Anthropic (Claude)\n"
  printf "  2) OpenAI (GPT)\n"
  printf "  3) Google (Gemini)\n"
  printf "  4) Skip\n"
  printf "Choice [1]: "
  read -r provider_choice

  case "${provider_choice:-1}" in
    1) PROVIDER="anthropic"; PROVIDER_ENV="ANTHROPIC_API_KEY" ;;
    2) PROVIDER="openai"; PROVIDER_ENV="OPENAI_API_KEY" ;;
    3) PROVIDER="google"; PROVIDER_ENV="GOOGLE_API_KEY" ;;
    *) return ;;
  esac

  printf "Paste your API key: "
  read -rs api_key
  echo ""

  if [ -n "$api_key" ]; then
    API_KEY="$api_key"
  fi
}

# ---------------------------------------------------------------------------
# Interactive channel setup
# ---------------------------------------------------------------------------
prompt_channel() {
  [ "$NON_INTERACTIVE" = "1" ] && return

  echo ""
  printf "${BOLD}Messaging Channel Setup${RESET}\n"
  printf "Connect a messaging platform so you can chat with Auxiora anywhere.\n\n"
  printf "Want to connect a channel now? [y/N] "
  read -r has_channel
  if [ "$has_channel" != "y" ] && [ "$has_channel" != "Y" ]; then
    return
  fi

  printf "\nWhich channel?\n"
  printf "  1) Telegram (easiest — just needs a bot token from @BotFather)\n"
  printf "  2) Discord\n"
  printf "  3) Slack\n"
  printf "  4) Skip\n"
  printf "Choice [1]: "
  read -r channel_choice

  case "${channel_choice:-1}" in
    1) CHANNEL="telegram"; TOKEN_NAME="Telegram bot token" ;;
    2) CHANNEL="discord"; TOKEN_NAME="Discord bot token" ;;
    3) CHANNEL="slack"; TOKEN_NAME="Slack bot token" ;;
    *) return ;;
  esac

  printf "Paste your %s: " "$TOKEN_NAME"
  read -rs channel_token
  echo ""

  if [ -n "$channel_token" ]; then
    CHANNEL_TOKEN="$channel_token"
  fi
}

# ---------------------------------------------------------------------------
# Write user config
# ---------------------------------------------------------------------------
write_user_config() {
  local config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/auxiora"
  mkdir -p "$config_dir"
  chmod 700 "$config_dir"

  # Write provider config
  if [ -n "$PROVIDER" ]; then
    local config_file="$config_dir/config.json"
    if [ "$PROVIDER" = "ollama" ]; then
      printf '{"provider":{"primary":"ollama"}}\n' > "$config_file"
    else
      printf '{"provider":{"primary":"%s"}}\n' "$PROVIDER" > "$config_file"
    fi
    chmod 600 "$config_file"
  fi

  # Store API key in env file
  if [ -n "$PROVIDER_ENV" ] && [ -n "$API_KEY" ]; then
    local env_file="$config_dir/.env"
    echo "${PROVIDER_ENV}=${API_KEY}" >> "$env_file"
    chmod 600 "$env_file"
  fi

  # Store channel token
  if [ -n "$CHANNEL" ] && [ -n "$CHANNEL_TOKEN" ]; then
    local env_file="$config_dir/.env"
    local token_var
    case "$CHANNEL" in
      telegram) token_var="TELEGRAM_BOT_TOKEN" ;;
      discord) token_var="DISCORD_BOT_TOKEN" ;;
      slack) token_var="SLACK_BOT_TOKEN" ;;
    esac
    echo "${token_var}=${CHANNEL_TOKEN}" >> "$env_file"
    chmod 600 "$env_file"
  fi
}

# ---------------------------------------------------------------------------
# Main install
# ---------------------------------------------------------------------------
do_install() {
  echo ""
  printf "${BOLD}  Auxiora Installer v${VERSION}${RESET}\n"
  echo "  =========================="
  echo ""
  info "Platform:     ${OS}-${ARCH} (${DISTRO})"
  info "Install to:   ${INSTALL_DIR}"
  info "Symlink:      ${BIN_LINK}"
  echo ""

  # -- Check Node.js -------------------------------------------------------
  local node_major
  node_major="$(node_version_major)"
  if [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
    install_node
  else
    success "Node.js $(node --version) found."
  fi

  # -- Download tarball -----------------------------------------------------
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  info "Downloading ${TARBALL_NAME}..."
  download "$DOWNLOAD_URL" "$tmpdir/$TARBALL_NAME"
  success "Download complete."

  # -- Extract --------------------------------------------------------------
  info "Extracting to ${INSTALL_DIR}..."

  # Remove old installation if present
  if [ -d "$INSTALL_DIR" ]; then
    warn "Existing installation found at ${INSTALL_DIR}, replacing it."
    rm -rf "$INSTALL_DIR"
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  tar xzf "$tmpdir/$TARBALL_NAME" -C "$tmpdir"

  # The tarball extracts to auxiora-VERSION-OS-ARCH/
  local extracted_dir="$tmpdir/auxiora-${VERSION}-${OS}-${ARCH}"
  if [ ! -d "$extracted_dir" ]; then
    fatal "Unexpected tarball structure. Expected directory: auxiora-${VERSION}-${OS}-${ARCH}"
  fi

  mv "$extracted_dir" "$INSTALL_DIR"
  success "Extracted to ${INSTALL_DIR}."

  # -- Create symlink -------------------------------------------------------
  info "Creating symlink..."
  mkdir -p "$(dirname "$BIN_LINK")"
  ln -sf "$INSTALL_DIR/bin/auxiora" "$BIN_LINK"
  success "Symlink created at ${BIN_LINK}."

  # -- Verify ---------------------------------------------------------------
  if ! "$BIN_LINK" --version &>/dev/null; then
    warn "Installation complete but 'auxiora --version' did not succeed."
    warn "You may need to add $(dirname "$BIN_LINK") to your PATH."
  fi

  # -- Interactive setup ----------------------------------------------------
  PROVIDER="" PROVIDER_ENV="" API_KEY="" CHANNEL="" CHANNEL_TOKEN="" TOKEN_NAME=""
  prompt_provider
  prompt_channel
  write_user_config

  # -- Done -----------------------------------------------------------------
  echo ""
  printf "${GREEN}${BOLD}✅ Auxiora installed${RESET}\n"
  [ -n "$PROVIDER" ] && printf "${GREEN}✅ Provider: ${PROVIDER}${RESET}\n"
  [ -n "$CHANNEL" ] && printf "${GREEN}✅ Channel: ${CHANNEL} configured${RESET}\n"
  printf "${GREEN}✅ 5 starter skills included${RESET}\n"
  printf "\n${BOLD}Dashboard: http://localhost:18800/dashboard${RESET}\n"
  echo ""

  # Check if BIN_LINK dir is in PATH
  local bin_dir
  bin_dir="$(dirname "$BIN_LINK")"
  if [[ ":$PATH:" != *":${bin_dir}:"* ]]; then
    warn "${bin_dir} is not in your PATH."
    echo ""
    echo "  Add it by running:"
    echo "    export PATH=\"${bin_dir}:\$PATH\""
    echo ""
    echo "  Or add that line to your shell profile (~/.bashrc, ~/.zshrc, etc.)."
    echo ""
    # Add to PATH for auto-start below
    export PATH="${bin_dir}:$PATH"
  fi

  # -- Auto-start -----------------------------------------------------------
  info "Starting Auxiora..."
  echo ""

  if command_exists auxiora; then
    auxiora start &
    AUXIORA_PID=$!

    # Wait for health check (up to 30 seconds)
    for i in $(seq 1 30); do
      if curl -sf "http://localhost:${AUXIORA_PORT:-18800}/health" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    success "Auxiora is running! Opening dashboard..."

    # Open browser
    DASHBOARD_URL="http://localhost:${AUXIORA_PORT:-18800}/dashboard"
    if command_exists open; then
      open "$DASHBOARD_URL"
    elif command_exists xdg-open; then
      xdg-open "$DASHBOARD_URL"
    else
      info "Open your browser to: $DASHBOARD_URL"
    fi
  else
    warn "Could not find auxiora in PATH. Run: auxiora start"
  fi
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
case "${1:-}" in
  --uninstall|-u)
    do_uninstall
    ;;
  --help|-h)
    echo "Usage: install.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --non-interactive Skip interactive provider/channel prompts"
    echo "  --uninstall, -u   Remove Auxiora from this system"
    echo "  --help, -h        Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  VERSION           Override version (default: ${VERSION})"
    echo "  RELEASE_URL       Override download base URL"
    echo "  INSTALL_DIR       Override installation directory"
    ;;
  --non-interactive)
    do_install
    ;;
  "")
    do_install
    ;;
  *)
    fatal "Unknown option: $1 (use --help for usage)"
    ;;
esac
