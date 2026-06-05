#!/usr/bin/env bash
set -euo pipefail

# Build all of a service's Lambda handlers via the crane + cargo-zigbuild nix
# packages (.#deploy-lambda-<name>), and assemble the target/lambda/<name>/
# bootstrap.zip layout the deploy action consumes -- identical to what the old
# cargo-lambda script produced, so nothing downstream changes.
#
# Unlike the cargo-lambda path, this never recompiles unchanged handlers: nix is
# content-addressed, so an unchanged handler is a pure cache hit (substituted
# from the warm /nix lambda disk or Cachix). Independent handler derivations
# also build in parallel within the single `nix build` invocation.

SERVICE="${SERVICE:?SERVICE is required}"
OUTPUT_DIR="${OUTPUT_DIR:-lambda-artifacts}"
CONFIG_PATH="${CONFIG_PATH:-.github/services-config.json}"

if ! jq -e --arg service "$SERVICE" '.services | has($service)' "$CONFIG_PATH" >/dev/null; then
  echo "Service '$SERVICE' not found in $CONFIG_PATH" >&2
  exit 1
fi

mapfile -t LAMBDAS < <(jq -r --arg service "$SERVICE" '.services[$service].deploy_lambdas[]? // empty' "$CONFIG_PATH")

if [[ ${#LAMBDAS[@]} -eq 0 ]]; then
  echo "No deploy_lambdas configured for $SERVICE"
  exit 0
fi

echo "Building Lambda artifacts for $SERVICE via nix: ${LAMBDAS[*]}"

# Keep pushing realised paths to Cachix so reruns / other services warm up.
if command -v cachix >/dev/null 2>&1 && [ -n "${CACHIX_CACHE_NAME:-}" ]; then
  cachix watch-store "$CACHIX_CACHE_NAME" &
  trap 'kill %1 2>/dev/null || true' EXIT
fi

# Build every handler for this service in one nix invocation: independent
# derivations build in parallel, and unchanged ones are pure cache hits.
installables=()
for lambda in "${LAMBDAS[@]}"; do
  installables+=(".#deploy-lambda-${lambda}")
done
nix build --no-link --print-build-logs "${installables[@]}"

# Assemble target/lambda/<name>/bootstrap.zip from each handler's store path.
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/target/lambda"
for lambda in "${LAMBDAS[@]}"; do
  # Already built above, so this just resolves the (cached) out path.
  out="$(nix build --no-link --print-out-paths ".#deploy-lambda-${lambda}")"
  mkdir -p "$OUTPUT_DIR/target/lambda/$lambda"
  cp "$out/$lambda/bootstrap.zip" "$OUTPUT_DIR/target/lambda/$lambda/bootstrap.zip"
done

tar -C "$OUTPUT_DIR" -czf lambda-artifacts.tar.gz target
