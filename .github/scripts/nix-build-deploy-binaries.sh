#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <nix-build-installable> [nix build args...]" >&2
  exit 2
fi

nix build "$@"
