#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE_DIR="${MARKETPLACE_DIR:-${ROOT_DIR}/../marketplace}"
SNAPSHOT_DIR="${ROOT_DIR}/public/marketplace"

if [ ! -d "${MARKETPLACE_DIR}" ]; then
  echo "Error: marketplace repo not found: ${MARKETPLACE_DIR}" >&2
  echo "Set MARKETPLACE_DIR=/path/to/marketplace if it is not next to chat." >&2
  exit 1
fi

if [ ! -f "${MARKETPLACE_DIR}/packages.json" ]; then
  echo "Error: missing ${MARKETPLACE_DIR}/packages.json" >&2
  echo "Run npm run check in the marketplace repo first." >&2
  exit 1
fi

if [ ! -f "${MARKETPLACE_DIR}/tools/packages.json" ]; then
  echo "Error: missing ${MARKETPLACE_DIR}/tools/packages.json" >&2
  echo "Run npm run check in the marketplace repo first." >&2
  exit 1
fi

mkdir -p "${SNAPSHOT_DIR}/tools"
cp "${MARKETPLACE_DIR}/packages.json" "${SNAPSHOT_DIR}/packages.json"
cp "${MARKETPLACE_DIR}/tools/packages.json" "${SNAPSHOT_DIR}/tools/packages.json"

echo "Synced marketplace snapshot:"
echo "  ${SNAPSHOT_DIR}/packages.json"
echo "  ${SNAPSHOT_DIR}/tools/packages.json"
