#!/bin/bash
# Wrapper script for Xcode build phase to avoid nix environment conflicts
# This is called by Xcode's "Build Rust Code" pre-build phase

set -e

# Clear nix-specific environment variables that conflict with iOS builds
unset NIX_CFLAGS_COMPILE NIX_LDFLAGS MACOSX_DEPLOYMENT_TARGET
unset NIX_CC NIX_CC_WRAPPER_TARGET_HOST_arm64_apple_darwin
unset CC CXX LIBRARY_PATH CPATH C_INCLUDE_PATH CPLUS_INCLUDE_PATH OBJC_INCLUDE_PATH
unset NIX_BINTOOLS NIX_BINTOOLS_WRAPPER_TARGET_HOST_arm64_apple_darwin
unset NIX_APPLE_SDK_VERSION

# Keep SDKROOT as set by Xcode - don't unset it here since xcode-script needs it
# DEVELOPER_DIR should already be set correctly by Xcode

# Add cargo to PATH if not present (Xcode may not inherit shell PATH)
export PATH="$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Run the tauri xcode-script with all arguments passed through
exec cargo tauri ios xcode-script "$@"
