#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

main() {
  local target_dir source_env target_env

  if [[ "$#" -ne 1 ]]; then
    echo "usage: $0 <target-dir>" >&2
    return 1
  fi

  target_dir=$1
  source_env="${SCRIPT_DIR}/../.env"
  target_env="${target_dir}/.env"

  if [[ "$target_dir" != /* ]]; then
    echo "target directory must be an absolute path: $target_dir" >&2
    return 1
  fi

  if [[ ! -f "$source_env" ]]; then
    echo "source config file not found: $source_env" >&2
    return 1
  fi

  if [[ ! -d "$target_dir" ]]; then
    echo "target directory not found: $target_dir" >&2
    return 1
  fi

  cp "$source_env" "$target_env" || return 1

  return 0
}

main "$@"
exit $?
