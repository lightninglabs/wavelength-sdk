#!/usr/bin/env bash
# Run against the released v0.2.1 AAR or XCFramework; fixtures exercise
# channel-capable bindings without a daemon, emulator, or wallet.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
case "${1:-}" in
  android)
    unzip -p "${2:-android/libs/Wavewalletdk.aar}" classes.jar > "$tmp/classes.jar"
    kotlinc android/src/main/java/engineering/lightning/wavelength/reactnative/ArkChannelBindings.kt \
      test-native/ArkChannelBindingsCheck.kt -cp "$tmp/classes.jar" -include-runtime -d "$tmp/check.jar"
    java -cp "$tmp/check.jar:$tmp/classes.jar" engineering.lightning.wavelength.reactnative.ArkChannelBindingsCheckKt
    ;;
  ios)
    framework="${2:-ios/Wavewalletdk.xcframework}"
    flags=(-std=c++20 -fobjc-arc -fmodules -fcxx-modules "-fmodules-cache-path=$tmp/modules")
    for abi in 0 1 2; do
      xcrun --sdk macosx clang++ "${flags[@]}" -DARK_ABI=$abi -F"$framework/ios-arm64" \
        test-native/ark-bindings.mm -framework Foundation -o "$tmp/check"
      "$tmp/check"
    done
    for spec in 'iphoneos arm64-apple-ios15.1 ios-arm64' \
      'iphonesimulator arm64-apple-ios15.1-simulator ios-arm64_x86_64-simulator'; do
      read -r sdk target slice <<< "$spec"
      xcrun --sdk "$sdk" clang++ "${flags[@]}" -target "$target" -DARK_ABI=0 -DLINK_RELEASED_RUNTIME \
        -F"$framework/$slice" test-native/ark-bindings.mm -framework Foundation \
        -framework Wavewalletdk -framework Security -lresolv -o "$tmp/ios-check"
    done
    ;;
  *) echo "usage: $0 android|ios [released artifact path]" >&2; exit 2 ;;
esac
