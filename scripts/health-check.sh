#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROJECT="chat"
SCHEMA_VERSION="1.0"

LEVEL="${HEALTH_LEVEL:-readiness}"
TIMEOUT="${HEALTH_TIMEOUT:-10}"
RETRIES="${HEALTH_RETRIES:-0}"
INTERVAL="${HEALTH_INTERVAL:-2}"
FORMAT="${HEALTH_FORMAT:-text}"
CONFIG_PATH="${HEALTH_CONFIG:-}"
BASE_URL="${HEALTH_BASE_URL:-}"
CHECK_PORT=""
WAIT_SECONDS="0"
QUIET="0"
VERBOSE="0"

CHECK_NAMES=()
CHECK_STATUSES=()
CHECK_MESSAGES=()
CHECK_DURATIONS=()
PASSED=0
WARNED=0
FAILED=0
SKIPPED=0
FRAMEWORK_ERROR=0
TIMED_OUT=0

usage() {
  cat <<'EOF'
Usage: scripts/health-check.sh [options]

Options:
  --level <level>       liveness, readiness, dependency, or all (default: readiness)
  --timeout <seconds>   Per-check network timeout (default: 10)
  --retries <count>     Retries after the first failed attempt (default: 0)
  --interval <seconds>  Retry interval (default: 2)
  --format <format>     text or json (default: text)
  --quiet               Only print the final result in text mode
  --verbose             Print extra diagnostics to stderr
  --config <path>       Env file to load before checks (default: .env when present)
  --base-url <url>      Service base URL (default: http://127.0.0.1:${PORT:-3020})
  --wait <seconds>      Wait up to this many seconds for checks to pass
  --help                Show this help

Environment:
  HEALTH_BASE_URL, HEALTH_TIMEOUT, HEALTH_RETRIES, HEALTH_INTERVAL,
  HEALTH_FORMAT, HEALTH_CONFIG
EOF
}

usage_error() {
  echo "Usage error: $*" >&2
  echo "Run scripts/health-check.sh --help for usage." >&2
  exit 2
}

is_non_negative_integer() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --level)
        [ "$#" -ge 2 ] || usage_error "--level requires a value"
        LEVEL="$2"
        shift 2
        ;;
      --timeout)
        [ "$#" -ge 2 ] || usage_error "--timeout requires a value"
        TIMEOUT="$2"
        shift 2
        ;;
      --retries)
        [ "$#" -ge 2 ] || usage_error "--retries requires a value"
        RETRIES="$2"
        shift 2
        ;;
      --interval)
        [ "$#" -ge 2 ] || usage_error "--interval requires a value"
        INTERVAL="$2"
        shift 2
        ;;
      --format)
        [ "$#" -ge 2 ] || usage_error "--format requires a value"
        FORMAT="$2"
        shift 2
        ;;
      --config)
        [ "$#" -ge 2 ] || usage_error "--config requires a value"
        CONFIG_PATH="$2"
        shift 2
        ;;
      --base-url)
        [ "$#" -ge 2 ] || usage_error "--base-url requires a value"
        BASE_URL="$2"
        shift 2
        ;;
      --wait)
        [ "$#" -ge 2 ] || usage_error "--wait requires a value"
        WAIT_SECONDS="$2"
        shift 2
        ;;
      --quiet)
        QUIET="1"
        shift
        ;;
      --verbose)
        VERBOSE="1"
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        usage_error "unknown option: $1"
        ;;
    esac
  done
}

validate_args() {
  case "${LEVEL}" in
    liveness|readiness|dependency|all) ;;
    *) usage_error "--level must be one of: liveness, readiness, dependency, all" ;;
  esac

  case "${FORMAT}" in
    text|json) ;;
    *) usage_error "--format must be text or json" ;;
  esac

  is_non_negative_integer "${TIMEOUT}" || usage_error "--timeout must be a non-negative integer"
  is_non_negative_integer "${RETRIES}" || usage_error "--retries must be a non-negative integer"
  is_non_negative_integer "${INTERVAL}" || usage_error "--interval must be a non-negative integer"
  is_non_negative_integer "${WAIT_SECONDS}" || usage_error "--wait must be a non-negative integer"

  if [ "${TIMEOUT}" -eq 0 ]; then
    usage_error "--timeout must be greater than 0"
  fi
}

load_env_file() {
  local path="${CONFIG_PATH}"
  if [ -z "${path}" ] && [ -f "${ROOT_DIR}/.env" ]; then
    path="${ROOT_DIR}/.env"
  fi

  if [ -z "${path}" ]; then
    return 0
  fi

  if [ ! -f "${path}" ]; then
    echo "Framework error: config file not found: ${path}" >&2
    exit 3
  fi

  if [ "${VERBOSE}" = "1" ]; then
    echo "Loading config: ${path}" >&2
  fi

  set +u
  set -a
  # shellcheck disable=SC1090
  . "${path}"
  set +a
  set -u
}

normalize_url() {
  local value="$1"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  while [ "${value}" != "/" ] && [ "${value%/}" != "${value}" ]; do
    value="${value%/}"
  done
  printf '%s' "${value}"
}

extract_url_port() {
  local url="$1"
  local default_port=""
  local rest host port

  case "${url}" in
    http://*)
      default_port="80"
      rest="${url#http://}"
      ;;
    https://*)
      default_port="443"
      rest="${url#https://}"
      ;;
    *)
      printf '%s' "${PORT:-3020}"
      return 0
      ;;
  esac

  host="${rest%%/*}"
  host="${host%%\?*}"
  port="${host##*:}"

  if [ "${port}" != "${host}" ] && is_non_negative_integer "${port}"; then
    printf '%s' "${port}"
    return 0
  fi

  printf '%s' "${default_port}"
}

setup_defaults() {
  PORT="${PORT:-3020}"
  if [ -z "${BASE_URL}" ]; then
    BASE_URL="http://127.0.0.1:${PORT}"
  fi
  BASE_URL="$(normalize_url "${BASE_URL}")"
  CHECK_PORT="$(extract_url_port "${BASE_URL}")"
}

now_ms() {
  if command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf "%.0f\n", time() * 1000'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time() * 1000))'
  else
    echo "$(($(date +%s) * 1000))"
  fi
}

version() {
  if command -v node >/dev/null 2>&1 && [ -f "${ROOT_DIR}/package.json" ]; then
    node -e "try { const p=require(process.argv[1]); console.log(p.version ? 'v' + String(p.version).replace(/^v/, '') : 'unknown') } catch { console.log('unknown') }" "${ROOT_DIR}/package.json" 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "${value}"
}

record_check() {
  local status="$1"
  local name="$2"
  local message="$3"
  local duration="$4"

  CHECK_STATUSES+=("${status}")
  CHECK_NAMES+=("${name}")
  CHECK_MESSAGES+=("${message}")
  CHECK_DURATIONS+=("${duration}")

  case "${status}" in
    PASS) PASSED=$((PASSED + 1)) ;;
    WARN) WARNED=$((WARNED + 1)) ;;
    FAIL) FAILED=$((FAILED + 1)) ;;
    SKIP) SKIPPED=$((SKIPPED + 1)) ;;
  esac

  if [ "${FORMAT}" = "text" ] && [ "${QUIET}" != "1" ]; then
    printf '[%s] %s: %s (%s ms)\n' "${status}" "${name}" "${message}" "${duration}"
  fi
}

http_status() {
  local url="$1"
  if ! command -v curl >/dev/null 2>&1; then
    HTTP_STATUS="000"
    HTTP_ERROR="curl is required but was not found"
    return 3
  fi

  local err_file
  err_file="$(mktemp "${TMPDIR:-/tmp}/chat-health-curl.XXXXXX")"
  local rc
  HTTP_STATUS=""
  HTTP_ERROR=""

  if HTTP_STATUS="$(curl -k -sS -o /dev/null -w "%{http_code}" \
    --connect-timeout "${TIMEOUT}" --max-time "${TIMEOUT}" \
    "${url}" 2>"${err_file}")"; then
    rc=0
  else
    rc=$?
  fi

  HTTP_ERROR="$(cat "${err_file}" 2>/dev/null || true)"
  rm -f "${err_file}"

  if [ "${rc}" -ne 0 ]; then
    HTTP_STATUS="000"
    if [ "${rc}" -eq 28 ]; then
      TIMED_OUT=1
    fi
    return 1
  fi
  return 0
}

find_pid() {
  local pid
  local pid_file="${ROOT_DIR}/.chat.pid"
  if [ -f "${pid_file}" ]; then
    pid="$(sed -n '1p' "${pid_file}" 2>/dev/null || true)"
    if is_service_pid "${pid}"; then
      printf '%s\n' "${pid}"
      return 0
    fi
  fi

  if command -v lsof >/dev/null 2>&1; then
    local candidates
    candidates="$(lsof -nP -tiTCP:"${CHECK_PORT:-${PORT:-3020}}" -sTCP:LISTEN 2>/dev/null || true)"
    for pid in ${candidates}; do
      if is_service_pid "${pid}"; then
        printf '%s\n' "${pid}"
        return 0
      fi
    done
  fi
}

is_running_pid() {
  local pid="$1"
  [ -n "${pid}" ] || return 1
  ps -p "${pid}" >/dev/null 2>&1
}

process_command() {
  local pid="$1"
  ps -p "${pid}" -o command= 2>/dev/null || true
}

is_service_pid() {
  local pid="$1"
  local command
  is_running_pid "${pid}" || return 1
  command="$(process_command "${pid}")"
  case "${command}" in
    *node*|*next-server*|*server.js*) return 0 ;;
    *) return 1 ;;
  esac
}

check_liveness() {
  local pid
  pid="$(find_pid)"
  if is_running_pid "${pid}"; then
    CHECK_MESSAGE="service process is running (pid ${pid})"
    return 0
  fi

  if http_status "${BASE_URL}/health/live"; then
    if [ "${HTTP_STATUS}" -eq 200 ]; then
      CHECK_MESSAGE="GET /health/live returned HTTP 200"
      return 0
    fi
  fi

  if http_status "${BASE_URL}/"; then
    if [ "${HTTP_STATUS}" -ge 200 ] && [ "${HTTP_STATUS}" -lt 500 ]; then
      CHECK_MESSAGE="service responded with HTTP ${HTTP_STATUS}"
      return 0
    fi
    CHECK_MESSAGE="service returned HTTP ${HTTP_STATUS}"
    return 1
  fi

  if [ "${HTTP_STATUS}" = "000" ] && [ -n "${HTTP_ERROR}" ]; then
    CHECK_MESSAGE="service did not respond: ${HTTP_ERROR}"
  else
    CHECK_MESSAGE="service did not respond"
  fi
  return 1
}

check_http_root() {
  if ! http_status "${BASE_URL}/"; then
    CHECK_MESSAGE="GET / failed: ${HTTP_ERROR:-no response}"
    return 1
  fi

  if [ "${HTTP_STATUS}" -ge 200 ] && [ "${HTTP_STATUS}" -lt 400 ]; then
    CHECK_MESSAGE="GET / returned HTTP ${HTTP_STATUS}"
    return 0
  fi

  CHECK_MESSAGE="GET / returned HTTP ${HTTP_STATUS}"
  return 1
}

check_ready_endpoint() {
  if ! http_status "${BASE_URL}/health/ready"; then
    CHECK_MESSAGE="GET /health/ready failed: ${HTTP_ERROR:-no response}"
    return 1
  fi

  if [ "${HTTP_STATUS}" -eq 200 ]; then
    CHECK_MESSAGE="GET /health/ready returned HTTP 200"
    return 0
  fi

  CHECK_MESSAGE="GET /health/ready returned HTTP ${HTTP_STATUS}"
  return 1
}

check_dependency_url() {
  local label="$1"
  local url="$2"

  if [ -z "${url}" ]; then
    CHECK_MESSAGE="${label} URL is not configured"
    return 2
  fi

  url="$(normalize_url "${url}")"
  if ! http_status "${url}/"; then
    CHECK_MESSAGE="${label} did not respond: ${HTTP_ERROR:-no response}"
    return 1
  fi

  if [ "${HTTP_STATUS}" -ge 200 ] && [ "${HTTP_STATUS}" -lt 500 ]; then
    CHECK_MESSAGE="${label} is reachable at configured base URL (HTTP ${HTTP_STATUS})"
    return 0
  fi

  CHECK_MESSAGE="${label} returned HTTP ${HTTP_STATUS}"
  return 1
}

check_router_dependency() {
  check_dependency_url "router" "${ROUTER_BACKEND_URL:-}"
}

check_webdav_dependency() {
  check_dependency_url "webdav" "${WEBDAV_BACKEND_BASE_URL:-}"
}

run_check() {
  local name="$1"
  local fn="$2"
  local attempt=0
  local max_attempts=$((RETRIES + 1))
  local last_message=""
  local started finished duration rc

  while [ "${attempt}" -lt "${max_attempts}" ]; do
    attempt=$((attempt + 1))
    CHECK_MESSAGE=""
    started="$(now_ms)"
    set +e
    "${fn}"
    rc=$?
    set -e
    finished="$(now_ms)"
    duration=$((finished - started))

    case "${rc}" in
      0)
        record_check "PASS" "${name}" "${CHECK_MESSAGE:-ok}" "${duration}"
        return 0
        ;;
      2)
        record_check "SKIP" "${name}" "${CHECK_MESSAGE:-skipped}" "${duration}"
        return 0
        ;;
      3)
        FRAMEWORK_ERROR=1
        record_check "FAIL" "${name}" "${CHECK_MESSAGE:-health check framework error}" "${duration}"
        return 0
        ;;
      4)
        record_check "WARN" "${name}" "${CHECK_MESSAGE:-warning}" "${duration}"
        return 0
        ;;
      *)
        last_message="${CHECK_MESSAGE:-failed}"
        if [ "${attempt}" -lt "${max_attempts}" ]; then
          sleep "${INTERVAL}"
          continue
        fi
        record_check "FAIL" "${name}" "${last_message}" "${duration}"
        return 0
        ;;
    esac
  done
}

reset_results() {
  CHECK_NAMES=()
  CHECK_STATUSES=()
  CHECK_MESSAGES=()
  CHECK_DURATIONS=()
  PASSED=0
  WARNED=0
  FAILED=0
  SKIPPED=0
  FRAMEWORK_ERROR=0
  TIMED_OUT=0
}

run_suite_once() {
  reset_results

  case "${LEVEL}" in
    liveness)
      run_check "process" check_liveness
      ;;
    readiness)
      run_check "process" check_liveness
      run_check "http" check_http_root
      run_check "ready" check_ready_endpoint
      ;;
    dependency)
      run_check "router" check_router_dependency
      run_check "webdav" check_webdav_dependency
      ;;
    all)
      run_check "process" check_liveness
      run_check "http" check_http_root
      run_check "ready" check_ready_endpoint
      run_check "router" check_router_dependency
      run_check "webdav" check_webdav_dependency
      ;;
  esac
}

result_status() {
  if [ "${FAILED}" -gt 0 ] || [ "${FRAMEWORK_ERROR}" -gt 0 ]; then
    echo "fail"
  elif [ "${WARNED}" -gt 0 ]; then
    echo "warn"
  else
    echo "pass"
  fi
}

result_exit_code() {
  if [ "${FRAMEWORK_ERROR}" -gt 0 ]; then
    echo "3"
  elif [ "${FAILED}" -gt 0 ] && [ "${TIMED_OUT}" -gt 0 ]; then
    echo "4"
  elif [ "${FAILED}" -gt 0 ]; then
    echo "1"
  else
    echo "0"
  fi
}

print_text_result() {
  local status="$1"
  local duration="$2"
  printf 'RESULT status=%s passed=%s warned=%s failed=%s skipped=%s duration_ms=%s\n' \
    "${status}" "${PASSED}" "${WARNED}" "${FAILED}" "${SKIPPED}" "${duration}"
}

print_json_result() {
  local status="$1"
  local started_at="$2"
  local duration="$3"
  local version_value
  version_value="$(version)"

  printf '{'
  printf '"schema_version":"%s",' "${SCHEMA_VERSION}"
  printf '"type":"health_check",'
  printf '"project":"%s",' "${PROJECT}"
  printf '"version":"%s",' "$(json_escape "${version_value}")"
  printf '"environment":"%s",' "$(json_escape "${NODE_ENV:-unknown}")"
  printf '"level":"%s",' "$(json_escape "${LEVEL}")"
  printf '"status":"%s",' "${status}"
  printf '"started_at":"%s",' "$(json_escape "${started_at}")"
  printf '"duration_ms":%s,' "${duration}"
  printf '"summary":{"passed":%s,"warned":%s,"failed":%s,"skipped":%s},' \
    "${PASSED}" "${WARNED}" "${FAILED}" "${SKIPPED}"
  printf '"checks":['
  local i
  for i in "${!CHECK_NAMES[@]}"; do
    if [ "${i}" -gt 0 ]; then
      printf ','
    fi
    local lower_status
    lower_status="$(printf '%s' "${CHECK_STATUSES[$i]}" | tr '[:upper:]' '[:lower:]')"
    printf '{"name":"%s","status":"%s","duration_ms":%s,"message":"%s"}' \
      "$(json_escape "${CHECK_NAMES[$i]}")" \
      "${lower_status}" \
      "${CHECK_DURATIONS[$i]}" \
      "$(json_escape "${CHECK_MESSAGES[$i]}")"
  done
  printf ']}'
  printf '\n'
}

run_with_wait() {
  local started_ms now deadline_ms status
  started_ms="$(now_ms)"
  deadline_ms=$((started_ms + WAIT_SECONDS * 1000))

  while true; do
    run_suite_once
    status="$(result_status)"
    if [ "${status}" != "fail" ] || [ "${WAIT_SECONDS}" -eq 0 ]; then
      return 0
    fi

    now="$(now_ms)"
    if [ "${now}" -ge "${deadline_ms}" ]; then
      return 4
    fi
    sleep "${INTERVAL}"
  done
}

main() {
  parse_args "$@"
  validate_args
  load_env_file
  setup_defaults

  local started_at started_ms finished_ms duration status exit_code wait_rc
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  started_ms="$(now_ms)"

  set +e
  run_with_wait
  wait_rc=$?
  set -e

  finished_ms="$(now_ms)"
  duration=$((finished_ms - started_ms))
  status="$(result_status)"
  exit_code="$(result_exit_code)"

  if [ "${wait_rc}" -eq 4 ] && [ "${status}" = "fail" ]; then
    exit_code="4"
  fi

  if [ "${FORMAT}" = "json" ]; then
    print_json_result "${status}" "${started_at}" "${duration}"
  else
    print_text_result "${status}" "${duration}"
  fi

  exit "${exit_code}"
}

main "$@"
