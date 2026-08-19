#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_CONF_FILE="${SCRIPT_DIR}/backup.conf"
PASSPHRASE_FILE="${SCRIPT_DIR}/.passphrase-file"
BACKUP_DIR="/opt/backup"
LOGFILE=""

BACKUP_CONF_FLAG="True"
BACKUP_CONF_PREFIX=""
BACKUP_CONF_SUFFIX=".conf.tar.gz.gpg"

init_log_file() {
  local logfile_name=$1
  local logfile_dir="/opt/logs"

  LOGFILE="${logfile_dir}/${logfile_name}"
  mkdir -p "$logfile_dir"
  touch "$LOGFILE"

  local filesize=0
  filesize=$(stat -c "%s" "$LOGFILE" 2>/dev/null || echo 0)
  if [[ "$filesize" -ge 1048576 ]]; then
    printf 'clear old logs at %s to avoid log file too big\n' "$(date)" > "$LOGFILE"
  fi
}

log() {
  echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log_err() {
  echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE" >&2
}

load_backup_conf() {
  if [[ ! -f "$BACKUP_CONF_FILE" ]]; then
    log_err "backup config file not found: $BACKUP_CONF_FILE"
    return 1
  fi

  # shellcheck disable=SC1090
  source "$BACKUP_CONF_FILE"

  BACKUP_CONF_FLAG="${BACKUP_CONF_FLAG:-True}"
  BACKUP_CONF_PREFIX="${BACKUP_CONF_PREFIX:-}"
  BACKUP_CONF_SUFFIX="${BACKUP_CONF_SUFFIX:-.conf.tar.gz.gpg}"
}

get_module_name() {
  local deploy_name=$1
  if [[ "$deploy_name" =~ ^(.+)-v[^-]+-[^-]{7}$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  else
    printf '%s\n' "$deploy_name"
  fi
}

cleanup_path() {
  local path=$1
  if [[ -n "$path" && "$path" == /tmp/* ]]; then
    rm -rf "$path"
  fi
}

main() {
  local real_path deploy_name module_name backup_name backup_path tmp_dir exit_code

  real_path="$(realpath "${SCRIPT_DIR}/..")"
  deploy_name="$(basename "$real_path")"
  module_name="$(get_module_name "$deploy_name")"
  init_log_file "config-backup-${module_name}.log"

  if ! load_backup_conf; then
    return 1
  fi

  if [[ "$BACKUP_CONF_FLAG" != "True" ]]; then
    log "config backup skipped because BACKUP_CONF_FLAG is not True"
    return 0
  fi

  backup_name="${BACKUP_CONF_PREFIX}${deploy_name}${BACKUP_CONF_SUFFIX}"
  backup_path="${BACKUP_DIR}/${backup_name}"
  tmp_dir="/tmp/${deploy_name}-conf"

  log "config backup started for $deploy_name"

  if [[ -f "$backup_path" ]]; then
    log "backup file already exists: $backup_path"
    return 255
  fi

  if [[ ! -f "${real_path}/.env" ]]; then
    log_err "required config file not found: ${real_path}/.env"
    return 1
  fi

  if [[ ! -f "$PASSPHRASE_FILE" ]]; then
    log_err "passphrase file not found: $PASSPHRASE_FILE"
    return 1
  fi

  if ! command -v gpg >/dev/null 2>&1; then
    log_err "gpg command not found"
    return 1
  fi

  mkdir -p "$BACKUP_DIR"
  cleanup_path "$tmp_dir"
  mkdir -p "$tmp_dir"

  exit_code=0
  cp "${real_path}/.env" "$tmp_dir/.env" || exit_code=1

  if [[ "$exit_code" -eq 0 ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "$PASSPHRASE_FILE" \
      -o "$backup_path" < <(tar czf - -C "$tmp_dir" .) || exit_code=1
  fi

  cleanup_path "$tmp_dir"

  if [[ "$exit_code" -eq 0 ]]; then
    log "config backup completed: $backup_path"
    return 0
  fi

  rm -f "$backup_path"
  log_err "config backup failed"
  return 1
}

main "$@"
exit $?
