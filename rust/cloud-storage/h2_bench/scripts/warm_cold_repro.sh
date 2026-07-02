#!/usr/bin/env bash
# Reproduces the CPU-idle-state-dependent lost wakeup in hyperium/h2#917
# (observed at head c970de5).
#
# Runs the same serial h2load shape twice against the same server binary:
#   1. "warm": immediately after spinning all cores for a few seconds
#   2. "cold": after letting the machine sit idle (deep C-states)
#
# On an affected h2 build, warm completes at thousands of req/s while cold
# collapses to ~24 req/s (~40 ms per request, suspiciously close to the Linux
# delayed-ACK timer that appears to rescue the lost wakeup).
#
# Usage:
#   warm_cold_repro.sh <path-to-h2_bench_server> [port] [idle-seconds]
#
# Build the server (with the h2 version under test patched in) via:
#   cargo build --release -p h2_bench --bin h2_bench_server
set -euo pipefail

BIN=${1:?usage: warm_cold_repro.sh <h2_bench_server binary> [port] [idle-seconds]}
PORT=${2:-8929}
IDLE_SECS=${3:-45}
THREADS=$(($(nproc) / 2))

"$BIN" "$PORT" "$THREADS" &>/dev/null &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1

spin_all_cores() {
  local pids=()
  for _ in $(seq "$(nproc)"); do
    (end=$((SECONDS + 8)); while ((SECONDS < end)); do :; done) &
    pids+=($!)
  done
  wait "${pids[@]}"
}

measure() {
  timeout 120 h2load -n 300 -c 1 -m 1 "http://127.0.0.1:$PORT/payload/1k" 2>&1 |
    grep "finished in" || echo "TIMED OUT (>120s for 300 requests)"
}

echo "warming all cores for 8s..."
spin_all_cores
echo "warm: $(measure)"

echo "idling for ${IDLE_SECS}s (let cores enter deep C-states)..."
sleep "$IDLE_SECS"
echo "cold: $(measure)"
