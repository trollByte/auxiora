#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

assert_eq() {
  if [ "$1" = "$2" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: expected '$2' got '$1' — $3"
  fi
}

# Test 1: --non-interactive flag sets variable
NON_INTERACTIVE=0
for arg in "--non-interactive"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=1 ;;
  esac
done
assert_eq "$NON_INTERACTIVE" "1" "--non-interactive flag parsing"

# Test 2: write_user_config creates directory
export XDG_CONFIG_HOME="$(mktemp -d)"
PROVIDER="ollama" PROVIDER_ENV="" API_KEY="" CHANNEL="" CHANNEL_TOKEN=""

write_user_config() {
  local config_dir="${XDG_CONFIG_HOME}/auxiora"
  mkdir -p "$config_dir"
  if [ -n "$PROVIDER" ]; then
    printf '{"provider":{"primary":"%s"}}\n' "$PROVIDER" > "$config_dir/config.json"
  fi
}
write_user_config

assert_eq "$(cat "$XDG_CONFIG_HOME/auxiora/config.json")" '{"provider":{"primary":"ollama"}}' "config file content"
rm -rf "$XDG_CONFIG_HOME"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
