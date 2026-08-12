# Building RoyalLagn APK on a Local Machine (Windows)

This project is an **Expo managed workflow** app. The `android/` folder is NOT
committed — it is generated on your machine by `npx expo prebuild`. This keeps
the project clean and reproducible.

## Required Tools & Versions

| Tool | Version |
|------|---------|
| Node.js | 20.x or 22.x (LTS) |
| npm | 10.x |
| Java / JDK | **17** (Temurin/Adoptium recommended) |
| Android Studio | Ladybug or newer (only needed for SDK manager / emulator) |
| Android SDK Platform | **API 36** (compileSdk for RN 0.81) |
| Android Build Tools | 36.0.0 |
| NDK | **27.1.12297006** |
| CMake | 3.22.1 |
| Gradle | 8.14 (downloaded automatically by the Gradle wrapper — do not install manually) |
| Android Gradle Plugin | managed by Expo (auto) |
| Kotlin | 2.0.x (managed by Expo, auto) |

> You do NOT need to install Gradle, AGP, or Kotlin manually.
> `gradlew` (the wrapper) downloads the exact right versions.

## Required Environment Variables (Windows)

```
ANDROID_HOME  = C:\Users\<you>\AppData\Local\Android\Sdk
JAVA_HOME     = C:\Program Files\Eclipse Adoptium\jdk-17.<x>-hotspot
```

Also add to `PATH`:
```
%ANDROID_HOME%\platform-tools
```

## Quick Start (one command)

After unzipping the project, open PowerShell in the project folder:

```powershell
.\setup.ps1
```

or with plain CMD:

```bat
setup.bat
```

This installs dependencies, regenerates the native Android project, and builds
the release APK.

The APK will be at:
```
android\app\build\outputs\apk\release\app-release.apk
```

## Manual Steps (what the script does)

```bash
# 1. Install JS dependencies (legacy-peer-deps is set in .npmrc automatically)
npm install

# 2. Generate the native Android project from app.json
npx expo prebuild --platform android --clean

# 3. Build the release APK
cd android
gradlew assembleRelease        # Windows
./gradlew assembleRelease      # macOS/Linux
```

To run on a connected device/emulator instead:
```bash
npx expo run:android
```

## Clean Commands (when a build gets stuck)

```bash
cd android
gradlew clean                     # clear Gradle build outputs
cd ..
npx expo prebuild --platform android --clean   # regenerate native project
```

Nuclear option (fully fresh state):
```powershell
Remove-Item -Recurse -Force node_modules, android
npm install
npx expo prebuild --platform android --clean
```

## Signing

`assembleRelease` uses the debug keystore by default in Expo prebuild projects,
which is fine for installing on your own devices. For Play Store distribution
you must create a release keystore and configure it in
`android/app/build.gradle` (or use `eas build` which manages signing for you).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npm install` fails with peer dependency errors | The project ships a `.npmrc` with `legacy-peer-deps=true`. Make sure it's present after unzipping. |
| `SDK location not found` | Set `ANDROID_HOME`, or create `android/local.properties` with `sdk.dir=C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk` |
| `Unsupported class file major version` | Wrong Java — you must use JDK 17. Check `java -version` and `JAVA_HOME`. |
| NDK errors | Install NDK 27.1.12297006 via Android Studio SDK Manager → SDK Tools → NDK (side by side) |
| CMake errors | Install CMake 3.22.1 via SDK Manager |
| Gradle daemon out of memory | Add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties` |
| Build worked, app crashes at launch | Run `npx expo run:android` to see logs, or `adb logcat *:E` |
| Stale caches after upgrading packages | `cd android && gradlew clean && cd .. && npx expo prebuild --platform android --clean` |

## Notes

- **New Architecture is enabled** (`newArchEnabled: true` in `app.json`).
  This is **required** — `react-native-reanimated` v4 and `react-native-worklets`
  both mandate New Architecture and will fail at build time without it.
  Expo SDK 54 + React Native 0.81 fully support New Architecture.
- All dependency versions are pinned to Expo SDK 54's expected versions
  (verified with `npx expo install --check`).
- Unused web-only packages (react-router, react-aria, etc.) have been removed.
- `legacy-peer-deps=true` is set in `.npmrc` so `npm install` works from a
  fresh clone without any extra flags.
