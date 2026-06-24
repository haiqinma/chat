#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE_DIR="${MARKETPLACE_DIR:-${ROOT_DIR}/../marketplace}"
MARKETPLACE_HOST="${MARKETPLACE_HOST:-127.0.0.1}"
MARKETPLACE_PORT="${MARKETPLACE_PORT:-3090}"
MARKETPLACE_BASE_URL="${MARKETPLACE_BASE_URL:-http://localhost:${MARKETPLACE_PORT}}"
export MARKETPLACE_HOST MARKETPLACE_PORT

if [ ! -d "${MARKETPLACE_DIR}" ]; then
  echo "Error: marketplace repo not found: ${MARKETPLACE_DIR}" >&2
  echo "Set MARKETPLACE_DIR=/path/to/marketplace if it is not next to chat." >&2
  exit 1
fi

if [ ! -f "${MARKETPLACE_DIR}/packages.json" ]; then
  echo "Error: missing ${MARKETPLACE_DIR}/packages.json" >&2
  echo "Generate marketplace packages before starting local preview." >&2
  exit 1
fi

if [ ! -f "${MARKETPLACE_DIR}/tools/packages.json" ]; then
  echo "Error: missing ${MARKETPLACE_DIR}/tools/packages.json" >&2
  echo "Generate marketplace tool packages before starting local preview." >&2
  exit 1
fi

marketplace_pid=""

cleanup() {
  if [ -n "${marketplace_pid}" ] && kill -0 "${marketplace_pid}" >/dev/null 2>&1; then
    kill "${marketplace_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

has_cors_header() {
  curl -fsSI "${MARKETPLACE_BASE_URL}/tools/packages.json" 2>/dev/null |
    tr -d '\r' |
    grep -qi '^Access-Control-Allow-Origin:'
}

if lsof -iTCP:"${MARKETPLACE_PORT}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  if has_cors_header; then
    echo "Using existing marketplace server with CORS: ${MARKETPLACE_BASE_URL}"
  else
    echo "Error: port ${MARKETPLACE_PORT} is occupied by a server without CORS headers." >&2
    echo "Stop it first, then rerun: npm run dev:marketplace" >&2
    echo "Current listener:" >&2
    lsof -iTCP:"${MARKETPLACE_PORT}" -sTCP:LISTEN -n -P >&2 || true
    exit 1
  fi
else
  echo "Starting marketplace server: ${MARKETPLACE_BASE_URL}"
  (
    cd "${ROOT_DIR}"
    node ./scripts/serve-marketplace.mjs "${MARKETPLACE_DIR}" "${MARKETPLACE_PORT}"
  ) &
  marketplace_pid="$!"

  for _ in $(seq 1 30); do
    if has_cors_header; then
      break
    fi
    sleep 0.2
  done

  if ! has_cors_header; then
    echo "Error: marketplace server started but CORS headers are not available." >&2
    exit 1
  fi
fi

export MARKETPLACE_SKILL_PACKAGES_URL="${MARKETPLACE_BASE_URL}/packages.json"
export MARKETPLACE_TOOL_PACKAGES_URL="${MARKETPLACE_BASE_URL}/tools/packages.json"

echo "Chat marketplace sources:"
echo "  skills: ${MARKETPLACE_SKILL_PACKAGES_URL}"
echo "  tools:  ${MARKETPLACE_TOOL_PACKAGES_URL}"

cd "${ROOT_DIR}"
npm run dev
