#!/usr/bin/env bash
set -euo pipefail

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

echo "Building Lambda artifacts for $SERVICE: ${LAMBDAS[*]}"

# Use a non-login shell: `nix develop -c` already exports the dev-shell PATH
# (just, cargo-lambda, toolchain). A login shell (`-l`) would re-source
# /etc/profile and reset PATH, dropping those tools on runners without a
# system-wide install (e.g. fresh Blacksmith images).
LAMBDAS_ENV="${LAMBDAS[*]}" nix develop .# -c bash -c '
  set -euo pipefail
  # Lambdas do not need max optimization; opt-level 2 (vs the release default 3)
  # trims leaf-crate codegen time with negligible runtime impact. Scoped to this
  # cargo-lambda build only (service binaries build via crane and are unaffected).
  export CARGO_PROFILE_RELEASE_OPT_LEVEL=2
  export SQLX_OFFLINE=true
  cd rust/cloud-storage
  ulimit -n 10240

  # Build every handler for this service in ONE cargo-lambda invocation so cargo
  # compiles the shared workspace deps once and parallelizes the leaf handler
  # crates across cores. Separate `just <lambda>/build` calls run serially --
  # cargo holds an exclusive target-dir lock, so backgrounding them would not
  # help. Falls back to the per-lambda recipe if the combined build fails, so
  # this can only improve build time, never break a deploy. (For a single-handler
  # service this is just one --bin flag, i.e. equivalent to the old path.)
  bin_flags=()
  for lambda in $LAMBDAS_ENV; do
    bin_flags+=(--bin "$lambda")
  done

  echo "::group::Build lambdas: $LAMBDAS_ENV"
  if cargo lambda build --release --output-format zip "${bin_flags[@]}"; then
    echo "Combined cargo-lambda build succeeded"
  else
    echo "::warning::Combined cargo-lambda build failed; falling back to per-lambda builds"
    for lambda in $LAMBDAS_ENV; do
      echo "::group::Build $lambda (fallback)"
      just "$lambda/build"
      echo "::endgroup::"
    done
  fi
  echo "::endgroup::"

  # Verify every expected artifact exists, whichever path ran.
  for lambda in $LAMBDAS_ENV; do
    test -f "target/lambda/$lambda/bootstrap.zip"
  done
'

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/target/lambda"
for lambda in "${LAMBDAS[@]}"; do
  mkdir -p "$OUTPUT_DIR/target/lambda/$lambda"
  cp "rust/cloud-storage/target/lambda/$lambda/bootstrap.zip" "$OUTPUT_DIR/target/lambda/$lambda/bootstrap.zip"
done

tar -C "$OUTPUT_DIR" -czf lambda-artifacts.tar.gz target
