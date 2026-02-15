#!/bin/sh
set -e

PORT="${AUXIORA_GATEWAY_PORT:-18800}"

cat <<EOF

  ╔══════════════════════════════════════════════╗
  ║              Auxiora is starting             ║
  ╚══════════════════════════════════════════════╝

  Dashboard:  http://localhost:${PORT}/dashboard

EOF

# Hint about persistence if /data looks empty (no vault yet)
if [ ! -f /data/config/auxiora/vault.enc ]; then
  cat <<EOF
  First run detected — complete setup in your browser.
  Mount a volume to /data to persist your configuration:

    docker run -v auxiora-data:/data -p ${PORT}:${PORT} ghcr.io/trollbyte/auxiora

EOF
fi

# exec replaces the shell so signals (SIGTERM, SIGINT) reach Node directly
exec node packages/cli/dist/index.js "$@"
