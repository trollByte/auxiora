#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# docker-run.sh — Build and run Auxiora in Docker
#
# Usage:
#   ./docker-run.sh              # Build and start Auxiora only
#   ./docker-run.sh --full       # Start with postgres, redis, monitoring
#   ./docker-run.sh --postgres   # Start with postgres
#   ./docker-run.sh --redis      # Start with redis
#   ./docker-run.sh --monitoring # Start with prometheus + grafana
#   ./docker-run.sh --build-only # Build the image without starting
#   ./docker-run.sh --down       # Stop and remove containers
#   ./docker-run.sh --logs       # Tail logs
#   ./docker-run.sh --shell      # Open a shell in the running container
# ──────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/deploy/docker/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/deploy/docker/.env"
IMAGE_NAME="auxiora"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No colour

log()  { echo -e "${CYAN}[auxiora]${NC} $*"; }
ok()   { echo -e "${GREEN}[auxiora]${NC} $*"; }
warn() { echo -e "${YELLOW}[auxiora]${NC} $*"; }
err()  { echo -e "${RED}[auxiora]${NC} $*" >&2; }

# ── Prerequisites ─────────────────────────────────────────────
check_prereqs() {
    if ! command -v docker &>/dev/null; then
        err "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info &>/dev/null; then
        err "Docker daemon is not running. Start Docker and try again."
        exit 1
    fi

    # Prefer 'docker compose' (v2 plugin) over 'docker-compose' (standalone)
    if docker compose version &>/dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        err "Docker Compose is not available. Install the compose plugin."
        exit 1
    fi
}

# ── .env setup ────────────────────────────────────────────────
ensure_env() {
    if [ ! -f "$ENV_FILE" ]; then
        warn ".env file not found — creating from .env.example"
        cp "$SCRIPT_DIR/deploy/docker/.env.example" "$ENV_FILE"
        warn "Edit $ENV_FILE to set API keys and passwords before production use."
    fi
}

# ── Compose wrapper ───────────────────────────────────────────
compose() {
    $COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# ── Commands ──────────────────────────────────────────────────
do_build() {
    log "Building Docker image..."
    compose build "$@"
    ok "Build complete."
}

do_up() {
    local profiles=("$@")
    local profile_args=()

    for p in "${profiles[@]}"; do
        profile_args+=(--profile "$p")
    done

    log "Starting Auxiora..."
    compose "${profile_args[@]}" up -d --build
    echo ""
    ok "Auxiora is running!"
    echo ""
    log "  Gateway:   http://localhost:${AUXIORA_PORT:-18800}"
    log "  Dashboard: http://localhost:${AUXIORA_PORT:-18800}/dashboard"

    for p in "${profiles[@]}"; do
        case "$p" in
            monitoring|full)
                log "  Grafana:    http://localhost:${GRAFANA_PORT:-3000}"
                log "  Prometheus: http://localhost:${PROMETHEUS_PORT:-9090}"
                ;;
        esac
    done

    echo ""
    log "Run './docker-run.sh --logs' to see logs"
    log "Run './docker-run.sh --down' to stop"
}

do_down() {
    log "Stopping containers..."
    compose --profile full down
    ok "Stopped."
}

do_logs() {
    compose logs -f --tail=100
}

do_shell() {
    local container
    container=$(docker ps --filter "ancestor=$IMAGE_NAME" --format '{{.ID}}' | head -1)
    if [ -z "$container" ]; then
        # Fall back to compose service name
        container=$(compose ps -q auxiora 2>/dev/null || true)
    fi
    if [ -z "$container" ]; then
        err "No running Auxiora container found."
        exit 1
    fi
    log "Opening shell in container $container..."
    docker exec -it "$container" /bin/sh
}

# ── Main ──────────────────────────────────────────────────────
main() {
    cd "$SCRIPT_DIR"
    check_prereqs

    # Source .env for variable substitution in log messages
    ensure_env
    set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

    if [ $# -eq 0 ]; then
        do_up
        exit 0
    fi

    local profiles=()

    while [ $# -gt 0 ]; do
        case "$1" in
            --build-only)
                do_build
                exit 0
                ;;
            --down|--stop)
                do_down
                exit 0
                ;;
            --logs)
                do_logs
                exit 0
                ;;
            --shell)
                do_shell
                exit 0
                ;;
            --full)
                profiles+=(full)
                ;;
            --postgres)
                profiles+=(postgres)
                ;;
            --redis)
                profiles+=(redis)
                ;;
            --monitoring)
                profiles+=(monitoring)
                ;;
            --help|-h)
                head -14 "${BASH_SOURCE[0]}" | tail -12
                exit 0
                ;;
            *)
                err "Unknown option: $1"
                err "Run './docker-run.sh --help' for usage."
                exit 1
                ;;
        esac
        shift
    done

    do_up "${profiles[@]}"
}

main "$@"
