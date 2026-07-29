#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/output"
ENV_FILE="${ROOT_DIR}/.env"
ENV_TEMPLATE="${ROOT_DIR}/.env.template"
BUILD_ENV_FILE="${ROOT_DIR}/.env.build"
BUILD_ENV_TEMPLATE="${ROOT_DIR}/.env.build.template"
MODE_FILE="${ROOT_DIR}/build.mode"
VALID_MODES=("standalone" "export" "app" "app-release")
RUNTIME_ENV_SOURCE=""
BUILD_ENV_SOURCE=""
MODE_SOURCE="default"

cd "${ROOT_DIR}"

usage() {
  echo "Usage: $0 [MODE] [TAG] [--output-dir DIR]"
  echo
  echo "MODE:"
  echo "  standalone   Build and package the standalone Node deployment bundle"
  echo "  export       Build and package the static export bundle"
  echo "  app          Build and package desktop app artifacts"
  echo "  app-release  Build and package desktop updater release artifacts"
  echo
  echo "TAG format: v<major>.<minor>.<patch>, for example: v1.0.1"
  echo
  echo "Examples:"
  echo "  $0"
  echo "  $0 standalone"
  echo "  $0 export v1.2.3"
  echo "  $0 app-release"
  echo "  $0 standalone --output-dir ./dist"
  echo
  echo "Defaults:"
  echo "  If MODE is omitted, ${MODE_FILE} will be used when present."
  echo "  If ${MODE_FILE} is missing, standalone is used."
}

is_valid_mode() {
  local mode="$1"
  for valid_mode in "${VALID_MODES[@]}"; do
    if [ "${mode}" = "${valid_mode}" ]; then
      return 0
    fi
  done
  return 1
}

load_env_file() {
  local env_path="$1"
  if [ -f "${env_path}" ]; then
    set -a
    . "${env_path}"
    set +a
  fi
}

write_package_version() {
  local file_path="$1"
  local value="$2"

  if [ ! -f "${file_path}" ]; then
    return 0
  fi

  node -e '
    const fs = require("fs");
    const filePath = process.argv[1];
    const version = process.argv[2];
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    data.version = version.replace(/^v/, "");
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  ' "${file_path}" "${value}"
}

ensure_runtime_env() {
  if [ ! -f "${ENV_FILE}" ]; then
    if [ ! -f "${ENV_TEMPLATE}" ]; then
      echo "Error: ${ENV_FILE} not found and ${ENV_TEMPLATE} is missing." >&2
      exit 1
    fi
    cp "${ENV_TEMPLATE}" "${ENV_FILE}"
    CREATED_ENV="true"
    echo "Generated ${ENV_FILE} from template for build."
  fi

  RUNTIME_ENV_SOURCE="${ENV_FILE}"
  load_env_file "${ENV_FILE}"
}

load_build_env() {
  if [ -f "${BUILD_ENV_FILE}" ]; then
    BUILD_ENV_SOURCE="${BUILD_ENV_FILE}"
    load_env_file "${BUILD_ENV_FILE}"
  elif [ -f "${BUILD_ENV_TEMPLATE}" ]; then
    BUILD_ENV_SOURCE="${BUILD_ENV_TEMPLATE}"
    load_env_file "${BUILD_ENV_TEMPLATE}"
  else
    BUILD_ENV_SOURCE="none"
  fi
}

read_mode_from_path() {
  local mode_path="$1"
  local configured_mode=""
  configured_mode="$(
    awk '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*$/ { next }
      {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        print
        exit
      }
    ' "${mode_path}"
  )"

  if [ -z "${configured_mode}" ]; then
    return 0
  fi

  if ! is_valid_mode "${configured_mode}"; then
    echo "Error: invalid mode '${configured_mode}' in ${mode_path}." >&2
    echo "Valid modes: ${VALID_MODES[*]}" >&2
    exit 1
  fi

  MODE="${configured_mode}"
  MODE_SOURCE="${mode_path}"
}

read_mode_file() {
  if [ -f "${MODE_FILE}" ]; then
    read_mode_from_path "${MODE_FILE}"
    return 0
  fi
}

print_package_config() {
  local effective_build_mode="n/a"
  local effective_build_app="n/a"
  local build_entry=""

  case "${MODE}" in
    standalone)
      effective_build_mode="standalone"
      effective_build_app="0"
      build_entry="npm run build"
      ;;
    export)
      effective_build_mode="export"
      effective_build_app="1"
      build_entry="npm run export"
      ;;
    app)
      effective_build_mode="export"
      effective_build_app="1"
      build_entry="npm run app:build"
      ;;
    app-release)
      effective_build_mode="export"
      effective_build_app="1"
      build_entry="npm run app:build:release"
      ;;
  esac

  echo "Package config:"
  echo "  mode: ${MODE}"
  echo "  mode_source: ${MODE_SOURCE}"
  echo "  tag: ${TARGET_TAG}"
  echo "  output_dir: ${OUTPUT_DIR}"
  echo "  package_name: ${PACKAGE_NAME}"
  echo "  runtime_env: ${RUNTIME_ENV_SOURCE}"
  echo "  build_env: ${BUILD_ENV_SOURCE}"
  echo "  build_entry: ${build_entry}"
  echo "  effective_BUILD_MODE: ${effective_build_mode}"
  echo "  effective_BUILD_APP: ${effective_build_app}"
  echo "  BUILD_VERSION: ${BUILD_VERSION:-}"
  echo "  DISABLE_CHUNK: ${DISABLE_CHUNK:-0}"
  echo "  TAURI_SIGNING_PRIVATE_KEY: ${TAURI_SIGNING_PRIVATE_KEY:+[set]}"
  echo "  TAURI_SIGNING_PRIVATE_KEY_PATH: ${TAURI_SIGNING_PRIVATE_KEY_PATH:-}"
  echo "  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:+[set]}"
}

run_build_for_mode() {
  case "${MODE}" in
    standalone)
      export BUILD_MODE="standalone"
      export BUILD_APP="0"
      npm run build
      ;;
    export)
      npm run export
      ;;
    app)
      npm run app:build
      ;;
    app-release)
      npm run app:build:release
      ;;
    *)
      echo "Error: unsupported package mode '${MODE}'." >&2
      exit 1
      ;;
  esac
}

copy_standalone_artifacts() {
  local standalone_dir="${ROOT_DIR}/.next/standalone"
  local static_dir="${ROOT_DIR}/.next/static"
  local public_dir="${ROOT_DIR}/public"
  local starter_script="${ROOT_DIR}/scripts/starter.sh"
  local health_check_script="${ROOT_DIR}/scripts/health-check.sh"

  if [ ! -d "${standalone_dir}" ]; then
    echo "Error: ${standalone_dir} not found. Build may have failed." >&2
    exit 1
  fi

  if [ ! -f "${starter_script}" ]; then
    echo "Error: ${starter_script} not found." >&2
    exit 1
  fi

  if [ ! -f "${health_check_script}" ]; then
    echo "Error: ${health_check_script} not found." >&2
    exit 1
  fi

  cp -R "${standalone_dir}/." "${PACKAGE_DIR}/"

  if [ -d "${static_dir}" ]; then
    mkdir -p "${PACKAGE_DIR}/.next"
    cp -R "${static_dir}" "${PACKAGE_DIR}/.next/static"
  fi

  if [ -d "${public_dir}" ]; then
    cp -R "${public_dir}" "${PACKAGE_DIR}/public"
  fi

  if [ -f "${ENV_TEMPLATE}" ]; then
    cp "${ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.template"
  fi

  if [ -f "${BUILD_ENV_TEMPLATE}" ]; then
    cp "${BUILD_ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.build.template"
  fi

  write_package_version "${PACKAGE_DIR}/package.json" "${TARGET_TAG}"

  mkdir -p "${PACKAGE_DIR}/scripts"
  cp "${starter_script}" "${PACKAGE_DIR}/scripts/starter.sh"
  cp "${health_check_script}" "${PACKAGE_DIR}/scripts/health-check.sh"
  chmod +x "${PACKAGE_DIR}/scripts/starter.sh"
  chmod +x "${PACKAGE_DIR}/scripts/health-check.sh"
}

copy_export_artifacts() {
  local export_dir="${ROOT_DIR}/out"

  if [ ! -d "${export_dir}" ]; then
    echo "Error: ${export_dir} not found. Export build may have failed." >&2
    exit 1
  fi

  cp -R "${export_dir}/." "${PACKAGE_DIR}/"

  if [ -f "${BUILD_ENV_TEMPLATE}" ]; then
    cp "${BUILD_ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.build.template"
  fi
}

copy_app_artifacts() {
  local bundle_dir="${ROOT_DIR}/src-tauri/target/release/bundle"

  if [ ! -d "${bundle_dir}" ]; then
    echo "Error: ${bundle_dir} not found. Desktop build may have failed." >&2
    exit 1
  fi

  cp -R "${bundle_dir}" "${PACKAGE_DIR}/bundle"

  if [ -f "${BUILD_ENV_TEMPLATE}" ]; then
    cp "${BUILD_ENV_TEMPLATE}" "${PACKAGE_DIR}/.env.build.template"
  fi
}

copy_artifacts_for_mode() {
  case "${MODE}" in
    standalone)
      copy_standalone_artifacts
      ;;
    export)
      copy_export_artifacts
      ;;
    app|app-release)
      copy_app_artifacts
      ;;
    *)
      echo "Error: unsupported package mode '${MODE}'." >&2
      exit 1
      ;;
  esac
}

MODE="standalone"
MODE_SET_FROM_ARG="false"
TAG_ARG=""
CUSTOM_OUTPUT_DIR=""

read_mode_file

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      if [ "$#" -lt 2 ]; then
        echo "Error: --output-dir requires a directory path." >&2
        exit 1
      fi
      CUSTOM_OUTPUT_DIR="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      if is_valid_mode "$1" && [ "${MODE_SET_FROM_ARG}" = "false" ] && [ -z "${TAG_ARG}" ]; then
        MODE="$1"
        MODE_SOURCE="cli"
        MODE_SET_FROM_ARG="true"
      elif is_valid_mode "$1"; then
        echo "Error: duplicate mode '$1'." >&2
        exit 1
      elif [ -z "${TAG_ARG}" ]; then
        TAG_ARG="$1"
      else
        echo "Error: unexpected argument '$1'." >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -n "${CUSTOM_OUTPUT_DIR}" ]; then
  case "${CUSTOM_OUTPUT_DIR}" in
    /*)
      OUTPUT_DIR="${CUSTOM_OUTPUT_DIR}"
      ;;
    *)
      OUTPUT_DIR="${ROOT_DIR}/${CUSTOM_OUTPUT_DIR}"
      ;;
  esac
fi

if [ -z "${OUTPUT_DIR}" ]; then
  echo "Error: output directory is empty." >&2
  exit 1
fi

if [ -n "${TAG_ARG}" ] && ! [[ "${TAG_ARG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if is_valid_mode "${TAG_ARG}"; then
    echo "Error: duplicate mode '${TAG_ARG}'." >&2
  else
    echo "Error: invalid TAG '${TAG_ARG}'. Expected format: v<major>.<minor>.<patch>" >&2
  fi
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
echo "Packaging mode: ${MODE}"
echo "Packaging from tag: ${TARGET_TAG}"

ensure_runtime_env
load_build_env

PROJECT_NAME="$(node -p "require('./package.json').name || 'app'")"
SHORT_HASH="$(git rev-parse --short=7 HEAD)"
PACKAGE_NAME="${PROJECT_NAME}-${MODE}-${TARGET_TAG}-${SHORT_HASH}"
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"
export BUILD_VERSION="${TARGET_TAG#v}"

print_package_config

if [ -f "${ROOT_DIR}/package-lock.json" ]; then
  HUSKY=0 npm ci --no-fund --no-audit
else
  HUSKY=0 npm install --no-fund --no-audit
fi

run_build_for_mode

mkdir -p "${OUTPUT_DIR}"
rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

copy_artifacts_for_mode

tar -czf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" -C "${OUTPUT_DIR}" "${PACKAGE_NAME}"

echo "Package created: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
