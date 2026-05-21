#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/output"
ENV_FILE="${ROOT_DIR}/.env"
ENV_TEMPLATE="${ROOT_DIR}/.env.template"
BUILD_ENV_FILE="${ROOT_DIR}/.env.build"
BUILD_ENV_TEMPLATE="${ROOT_DIR}/.env.build.template"

cd "${ROOT_DIR}"

usage() {
  echo "Usage: $0 [TAG]"
  echo "TAG format: v<major>.<minor>.<patch>, for example: v1.0.1"
}

load_env_file() {
  local env_path="$1"
  if [ -f "${env_path}" ]; then
    set -a
    . "${env_path}"
    set +a
  fi
}

if [ "$#" -gt 1 ]; then
  usage
  exit 1
fi

TAG_ARG="${1:-}"
if [ -n "${TAG_ARG}" ] && [[ ! "${TAG_ARG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: invalid TAG '${TAG_ARG}'. Expected format: v<major>.<minor>.<patch>" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: current directory is not a git repository." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is not clean. Please commit or stash changes first." >&2
  exit 1
fi

ORIGINAL_REF="$(git symbolic-ref --quiet --short HEAD || git rev-parse HEAD)"
RESTORE_REF="false"
CREATED_ENV="false"

cleanup() {
  if [ "${CREATED_ENV}" = "true" ] && [ -f "${ENV_FILE}" ]; then
    rm -f "${ENV_FILE}"
  fi
  if [ "${RESTORE_REF}" = "true" ]; then
    git checkout -q "${ORIGINAL_REF}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

git fetch --tags origin >/dev/null 2>&1 || git fetch --tags >/dev/null 2>&1 || true

TARGET_TAG=""
if [ -n "${TAG_ARG}" ]; then
  if ! git rev-parse -q --verify "refs/tags/${TAG_ARG}" >/dev/null 2>&1; then
    echo "Tag '${TAG_ARG}' does not exist. Skip packaging."
    exit 0
  fi
  TARGET_TAG="${TAG_ARG}"
else
  if ! git show-ref --verify --quiet "refs/heads/main"; then
    echo "Error: local branch 'main' does not exist." >&2
    exit 1
  fi

  MAX_TAG="$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V | tail -n 1 || true)"
  MAIN_HEAD="$(git rev-parse main)"

  if [ -n "${MAX_TAG}" ]; then
    MAX_TAG_HEAD="$(git rev-list -n 1 "${MAX_TAG}")"
    if [ "${MAX_TAG_HEAD}" = "${MAIN_HEAD}" ]; then
      echo "Latest tag '${MAX_TAG}' already points to main HEAD. Skip packaging."
      exit 0
    fi
    if [[ "${MAX_TAG}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
      MAJOR="${BASH_REMATCH[1]}"
      MINOR="${BASH_REMATCH[2]}"
      PATCH="${BASH_REMATCH[3]}"
    else
      echo "Error: latest tag '${MAX_TAG}' does not match expected format." >&2
      exit 1
    fi
  else
    MAJOR=0
    MINOR=0
    PATCH=0
  fi

  NEXT_PATCH=$((PATCH + 1))
  TARGET_TAG="v${MAJOR}.${MINOR}.${NEXT_PATCH}"

  if git rev-parse -q --verify "refs/tags/${TARGET_TAG}" >/dev/null 2>&1; then
    echo "Error: tag '${TARGET_TAG}' already exists." >&2
    exit 1
  fi

  git tag "${TARGET_TAG}" "${MAIN_HEAD}"
  git push origin "${TARGET_TAG}"
  echo "Created and pushed tag: ${TARGET_TAG}"
fi

RESTORE_REF="true"
git checkout -q "${TARGET_TAG}"
echo "Packaging from tag: ${TARGET_TAG}"

if [ ! -f "${ENV_FILE}" ]; then
  if [ ! -f "${ENV_TEMPLATE}" ]; then
    echo "Error: ${ENV_FILE} not found and ${ENV_TEMPLATE} is missing." >&2
    exit 1
  fi
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"
  CREATED_ENV="true"
  echo "Generated ${ENV_FILE} from template for build."
fi

load_env_file "${ENV_FILE}"

if [ -f "${BUILD_ENV_FILE}" ]; then
  load_env_file "${BUILD_ENV_FILE}"
elif [ -f "${BUILD_ENV_TEMPLATE}" ]; then
  load_env_file "${BUILD_ENV_TEMPLATE}"
fi

PROJECT_NAME="$(node -p "require('./package.json').name || 'app'")"
SHORT_HASH="$(git rev-parse --short=7 HEAD)"
PACKAGE_NAME="${PROJECT_NAME}-${TARGET_TAG}-${SHORT_HASH}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"

if [ ! -d "${ROOT_DIR}/node_modules" ]; then
  if [ -f "${ROOT_DIR}/package-lock.json" ]; then
    HUSKY=0 npm ci --no-fund --no-audit
  else
    HUSKY=0 npm install --no-fund --no-audit
  fi
fi

npm run build

STANDALONE_DIR="${ROOT_DIR}/.next/standalone"
STATIC_DIR="${ROOT_DIR}/.next/static"
PUBLIC_DIR="${ROOT_DIR}/public"
STARTER_SCRIPT="${ROOT_DIR}/scripts/starter.sh"

if [ ! -d "${STANDALONE_DIR}" ]; then
  echo "Error: ${STANDALONE_DIR} not found. Build may have failed." >&2
  exit 1
fi

if [ ! -f "${STARTER_SCRIPT}" ]; then
  echo "Error: ${STARTER_SCRIPT} not found." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

# Standalone output includes the runnable server.js and runtime dependencies.
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

if [ -f "${BUILD_ENV_TEMPLATE}" ]; then
  cp "${BUILD_ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.build.template"
fi

mkdir -p "${PACKAGE_DIR}/scripts"
cp "${STARTER_SCRIPT}" "${PACKAGE_DIR}/scripts/starter.sh"
chmod +x "${PACKAGE_DIR}/scripts/starter.sh"

tar -czf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" -C "${OUTPUT_DIR}" "${PACKAGE_NAME}"

echo "Package created: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
