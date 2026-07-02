#!/usr/bin/env bash
# h2load sweep against h2_bench_server, isolating the server-side h2 from the
# client (h2load is nghttp2-based, unaffected by Rust h2 changes).
#
# Usage:
#   run_h2load.sh <path-to-h2_bench_server> [label] [port] [server-threads]
#
# Build the server with:
#   cargo build --release -p h2_bench --bin h2_bench_server
#
# Requires: h2load (from nghttp2).
set -euo pipefail

BIN=${1:?usage: run_h2load.sh <h2_bench_server binary> [label] [port] [threads]}
LABEL=${2:-$(basename "$BIN")}
PORT=${3:-8929}
THREADS=${4:-$(($(nproc) / 2))}

"$BIN" "$PORT" "$THREADS" &>/dev/null &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1

echo "### $LABEL (port $PORT, $THREADS server threads)"
run() {
  local desc=$1
  shift
  local out
  out=$(timeout 300 h2load "$@" 2>&1 | grep -E "finished in" | head -1)
  printf "%-28s %s\n" "$desc" "${out:-TIMED OUT / FAILED}"
}

run "1k  c1  m1   (serial)" -n 2000 -c 1 -m 1 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c1  m2" -n 2000 -c 1 -m 2 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c1  m8" -n 5000 -c 1 -m 8 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c1  m64" -n 50000 -c 1 -m 64 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c1  m256" -n 50000 -c 1 -m 256 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c4  m64" -n 100000 -c 4 -m 64 "http://127.0.0.1:$PORT/payload/1k"
run "1k  c16 m16" -n 100000 -c 16 -m 16 "http://127.0.0.1:$PORT/payload/1k"
run "64k c1  m8" -n 5000 -c 1 -m 8 "http://127.0.0.1:$PORT/payload/64k"
run "64k c1  m64" -n 20000 -c 1 -m 64 "http://127.0.0.1:$PORT/payload/64k"
run "1m  c1  m8" -n 2000 -c 1 -m 8 "http://127.0.0.1:$PORT/payload/1m"
