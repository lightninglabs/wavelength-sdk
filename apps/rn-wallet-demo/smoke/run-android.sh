#!/usr/bin/env bash
# Run against an already-booted emulator with the SDK's AAR staged.
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_PUBLIC_NATIVE_SMOKE=1
mkdir -p smoke-output
trap 'adb logcat -d > smoke-output/logcat.txt 2>&1 || true' EXIT

# Regenerate so the separate smoke app ID is also used after a normal demo
# build. Release includes the JS bundle and never connects to Metro.
pnpm exec expo prebuild --clean --platform android --no-install
pnpm exec expo run:android --variant release --no-bundler \
  2>&1 | tee smoke-output/build.log
maestro test --test-output-dir smoke-output/maestro .maestro/native-storage.yaml
