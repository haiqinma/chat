#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/output"

cd "${ROOT_DIR}"

PROJECT_NAME="$(node -p "require('./package.json').name || 'app'")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SHORT_HASH="$(git -C "${ROOT_DIR}" rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
PACKAGE_NAME="${PROJECT_NAME}-${TIMESTAMP}-${SHORT_HASH}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

npm run build

STANDALONE_DIR="${ROOT_DIR}/.next/standalone"
STATIC_DIR="${ROOT_DIR}/.next/static"
PUBLIC_DIR="${ROOT_DIR}/public"
ENV_TEMPLATE="${ROOT_DIR}/.env.template"

if [ ! -d "${STANDALONE_DIR}" ]; then
  echo "Error: ${STANDALONE_DIR} not found. Build may have failed." >&2
  exit 1
fi

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

cp -R "${STANDALONE_DIR}/." "${PACKAGE_DIR}/"

if [ -d "${STATIC_DIR}" ]; then
  mkdir -p "${PACKAGE_DIR}/.next"
  cp -R "${STATIC_DIR}" "${PACKAGE_DIR}/.next/static"
fi

if [ -d "${PUBLIC_DIR}" ]; then
  cp -R "${PUBLIC_DIR}" "${PACKAGE_DIR}/public"
fi

if [ -f "${ENV_TEMPLATE}" ]; then
  cp "${ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.template"
fi

mkdir -p "${PACKAGE_DIR}/scripts"
cp "${ROOT_DIR}/scripts/start.sh" "${PACKAGE_DIR}/scripts/start.sh"
chmod +x "${PACKAGE_DIR}/scripts/start.sh"

mkdir -p "${OUTPUT_DIR}"
tar -czf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" -C "${OUTPUT_DIR}" "${PACKAGE_NAME}"

echo "Package created: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
