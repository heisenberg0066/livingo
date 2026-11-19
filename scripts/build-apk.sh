#!/usr/bin/env bash
# Builds a debug-signed Livingo APK you can install on Android.
# A debug APK is signed with the Android debug keystore, so it installs
# after you allow installs from this source. It is the right build for the two of you.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${ANDROID_HOME:-}" && -d "$HOME/android-sdk" ]]; then
  export ANDROID_HOME="$HOME/android-sdk"
fi
if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME is not set. Install the Android command-line tools and SDK 36, then retry." >&2
  exit 1
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "Building the web app…"
npm run build
npx cap sync android

cd android
if [[ ! -f local.properties ]]; then
  echo "sdk.dir=$ANDROID_HOME" > local.properties
fi

# Keep the Gradle workers small so a memory-tight machine can finish.
export GRADLE_OPTS="${GRADLE_OPTS:--Dorg.gradle.workers.max=2 -Dorg.gradle.jvmargs=-Xmx2g}"

./gradlew assembleDebug --no-daemon
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo
echo "Debug APK: $APK"
echo "Install: adb install -r \"$APK\""
