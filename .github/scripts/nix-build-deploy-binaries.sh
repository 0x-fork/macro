#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <nix-build-installable> [nix build args...]" >&2
  exit 2
fi

sccache_root="${MACRO_NIX_SCCACHE_DIR:-/tmp/macro-nix-sccache}"
sccache_cache_dir="$sccache_root/cache"
sccache_config="$sccache_root/config.toml"
aws_credentials="$sccache_root/aws-credentials"
aws_config="$sccache_root/aws-config"

cleanup_sccache_secrets() {
  rm -f "$sccache_config" "$aws_credentials" "$aws_config"
}

prepare_sccache_config() {
  if [[ -z "${SCCACHE_BUCKET:-}" ]]; then
    echo "::warning::SCCACHE_BUCKET is not set; deploy Nix build will compile without remote sccache."
    return 0
  fi

  local region="${SCCACHE_REGION:-us-east-1}"
  local endpoint="${SCCACHE_ENDPOINT:-s3.${region}.amazonaws.com}"
  local key_prefix="${SCCACHE_S3_KEY_PREFIX:-sccache/}"
  local use_ssl="${SCCACHE_S3_USE_SSL:-true}"

  case "$use_ssl" in
    true | false) ;;
    1) use_ssl=true ;;
    0) use_ssl=false ;;
    *)
      echo "SCCACHE_S3_USE_SSL must be true/false/1/0, got: $use_ssl" >&2
      exit 2
      ;;
  esac

  install -d -m 0755 "$sccache_root"
  install -d -m 0777 "$sccache_cache_dir"
  chmod 0755 "$sccache_root"
  chmod 0777 "$sccache_cache_dir"

  local tmp_config
  tmp_config="$(mktemp "$sccache_root/config.toml.XXXXXX")"
  cat > "$tmp_config" <<EOF
[cache.s3]
bucket = "$SCCACHE_BUCKET"
endpoint = "$endpoint"
use_ssl = $use_ssl
key_prefix = "$key_prefix"
EOF
  chmod 0644 "$tmp_config"
  mv "$tmp_config" "$sccache_config"

  local tmp_aws_config
  tmp_aws_config="$(mktemp "$sccache_root/aws-config.XXXXXX")"
  cat > "$tmp_aws_config" <<EOF
[default]
region = $region
EOF
  chmod 0644 "$tmp_aws_config"
  mv "$tmp_aws_config" "$aws_config"

  if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    local tmp_credentials
    tmp_credentials="$(mktemp "$sccache_root/aws-credentials.XXXXXX")"
    {
      echo "[default]"
      echo "aws_access_key_id = $AWS_ACCESS_KEY_ID"
      echo "aws_secret_access_key = $AWS_SECRET_ACCESS_KEY"
      if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
        echo "aws_session_token = $AWS_SESSION_TOKEN"
      fi
    } > "$tmp_credentials"
    # Nix daemon builds run as nixbld users, so these CI-scoped credential files
    # must be readable outside the runner user. They are removed when this script exits.
    chmod 0644 "$tmp_credentials"
    mv "$tmp_credentials" "$aws_credentials"
  else
    rm -f "$aws_credentials"
    echo "::warning::AWS credentials are not set; sccache will rely on the runner AWS provider chain."
  fi

  echo "Configured deploy Nix build sccache files under $sccache_root"
}

trap cleanup_sccache_secrets EXIT

cleanup_sccache_secrets
prepare_sccache_config
nix build --option sandbox relaxed "$@"
