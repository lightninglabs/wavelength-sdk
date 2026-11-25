#!/usr/bin/env bash
# Run on a Mac with an iOS simulator runtime and the SDK's framework staged.
set -euo pipefail
cd "$(dirname "$0")/.."
export EXPO_PUBLIC_NATIVE_SMOKE=1
export LANG=en_US.UTF-8
mkdir -p smoke-output

simulator_id="$(xcrun simctl list devices available -j | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => input += chunk);
  process.stdin.on("end", () => {
    const device = Object.entries(JSON.parse(input).devices)
      .filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([, devices]) => devices)
      .find((device) => device.name.startsWith("iPhone"));
    if (!device) throw new Error("No available iPhone simulator");
    process.stdout.write(device.udid);
  });
')"
# bootstatus -b boots the selected device if needed and waits for it.
xcrun simctl bootstatus "$simulator_id" -b
trap 'cp -R "$HOME/Library/Logs/DiagnosticReports" smoke-output/crashes 2>/dev/null || true' EXIT

pnpm exec expo prebuild --clean --platform ios --no-install
# Expo's simulator launcher opens a development-server URL even for Release
# with --no-bundler. Build only, then let Maestro launch the installed bundle.
pnpm exec expo run:ios --configuration Release --no-bundler \
  --device generic --output ios/smoke-build 2>&1 | tee smoke-output/build.log
xcrun simctl install "$simulator_id" \
  ios/smoke-build/WavelengthStorageSmoke.app
maestro --device "$simulator_id" test --test-output-dir smoke-output/maestro \
  .maestro/native-storage.yaml
