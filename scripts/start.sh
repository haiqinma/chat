#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required but was not found in PATH." >&2
  exit 1
fi

ENV_TEMPLATE="${ROOT_DIR}/.env.template"
ENV_FILE="${ROOT_DIR}/.env.local"

if [ ! -f "${ENV_FILE}" ] && [ -f "${ENV_TEMPLATE}" ]; then
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"
fi

if [ -f "${ENV_FILE}" ]; then
  set -a
  . "${ENV_FILE}"
  set +a
fi

export NODE_ENV=production
export PORT="${PORT:-3020}"

SERVER_ENTRY="${ROOT_DIR}/server.js"
if [ ! -f "${SERVER_ENTRY}" ]; then
  echo "Error: server.js not found at ${SERVER_ENTRY}" >&2
  exit 1
fi

cd "${ROOT_DIR}"
exec node "${SERVER_ENTRY}"
