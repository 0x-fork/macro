#!/bin/bash
# Wrapper script to run cargo tauri ios dev with clean environment
# This avoids nix darwin flags conflicting with iOS cross-compilation

set -e

# Get paths to nix tools we need to keep
# Find the nix-provided cargo (skip ~/.cargo/bin which might be rustup)
NIX_RUST_BIN=$(echo "$PATH" | tr ':' '\n' | grep -E "^/nix/store.*rust" | head -1)
if [ -z "$NIX_RUST_BIN" ]; then
  NIX_RUST_BIN=$(dirname "$(which cargo)")
fi
NIX_BUN_BIN=$(dirname "$(which bun)")
NIX_NODE_BIN=$(dirname "$(which node)")
NIX_JUST_BIN=$(dirname "$(which just)")
NIX_IDEVICE_BIN=$(dirname "$(which idevice_id)" 2>/dev/null || echo "")
NIX_IOS_DEPLOY_BIN=$(dirname "$(which ios-deploy)" 2>/dev/null || echo "")
NIX_TAURI_BIN=$(echo "$PATH" | tr ':' '\n' | grep -E "^/nix/store.*tauri" | head -1)
if [ -z "$NIX_TAURI_BIN" ]; then
  NIX_TAURI_BIN=$(dirname "$(which cargo-tauri)")
fi

# Preserve HOME (needed for cargo to find .cargo/config.toml, etc.)
export HOME="${HOME:-$(eval echo ~$USER)}"

# Clear nix-specific environment variables that conflict with iOS builds
unset NIX_CFLAGS_COMPILE NIX_LDFLAGS MACOSX_DEPLOYMENT_TARGET
unset NIX_CC NIX_CC_WRAPPER_TARGET_HOST_arm64_apple_darwin
unset CC CXX LIBRARY_PATH CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH OBJC_INCLUDE_PATH
unset NIX_BINTOOLS NIX_BINTOOLS_WRAPPER_TARGET_HOST_arm64_apple_darwin
unset SDKROOT NIX_APPLE_SDK_VERSION

# Point DEVELOPER_DIR to actual Xcode (not Nix SDK) so simctl/xcodebuild work
export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

# Set PATH: system Xcode tools first, then nix tools we need (exclude ~/.cargo/bin to avoid rustup conflicts)
export PATH="$DEVELOPER_DIR/usr/bin:$NIX_RUST_BIN:$NIX_TAURI_BIN:$NIX_BUN_BIN:$NIX_NODE_BIN:$NIX_JUST_BIN:$NIX_IDEVICE_BIN:$NIX_IOS_DEPLOY_BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Write the nix cargo path to a file that xcode-build.sh can read
# This is needed because Xcode doesn't inherit our environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "$NIX_RUST_BIN" > "$SCRIPT_DIR/.nix-cargo-path"

# Run cargo-tauri with arguments
exec cargo-tauri "$@"
