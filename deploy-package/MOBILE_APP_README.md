# Coins Sale ERP — Mobile App (Build the APK)

The mobile app is an Expo / React Native project. There are two ways to get a
working `.apk` file. Pick whichever is easier for you.

> **Before you start:** deploy the API server first (see
> `api-server/README.md`). You will need your API's public domain (e.g.
> `api.your-domain.com`) for step 3 below.

---

## Option A — EAS Build (cloud, no Android SDK needed) — RECOMMENDED

Expo's free build service compiles the APK for you in the cloud. You don't
need Android Studio, JDK, or 5 GB of SDK downloads on your machine.

### 1. Install Node.js 20+ and pnpm

```bash
# macOS (Homebrew)
brew install node@20 pnpm

# Linux / WSL
curl -fsSL https://get.pnpm.io/install.sh | sh -
# (Then install Node 20+ via your package manager or nvm.)

# Windows
# Install Node 20+ from https://nodejs.org, then in PowerShell:
npm install -g pnpm
```

### 2. Extract the source and install dependencies

```bash
mkdir coins-sale-source && tar -xzf coins-sale-source.tar.gz -C coins-sale-source
cd coins-sale-source
pnpm install
```

(On Windows: extract `coins-sale-source.zip` with 7-Zip, then `cd` into the
folder and run `pnpm install`.)

### 3. Point the app at your deployed API

The app reads `EXPO_PUBLIC_DOMAIN` at **build time** and bakes it into the
APK. EAS cloud builds do **not** read your local `.env`, so set it in
`artifacts/mobile/eas.json` instead:

```jsonc
// artifacts/mobile/eas.json — every "build" profile
"env": {
  "EXPO_PUBLIC_DOMAIN": "api.your-domain.com"
}
```

Use the **bare domain only** — no `https://`, no trailing slash, no `/api`.
The app appends `/api` itself.

> Tip: for sensitive domains, run `npx eas-cli env:create` instead and remove
> the value from `eas.json` — but for self-hosted ERPs the URL is usually fine
> to commit.

### 4. Log in to Expo and build

```bash
# from artifacts/mobile/
npx eas-cli login              # free account at expo.dev if you don't have one
npx eas-cli build:configure    # one-time setup; pick Android
npx eas-cli build --profile preview --platform android
```

Wait ~10–15 minutes. EAS prints a build URL — open it to download the `.apk`.

### 5. Install on your phone

Copy the `.apk` to your Android device and tap to install. You may need to
enable "Install unknown apps" for your file browser the first time.

### 6. Release a new version later

Just bump `version` in `app.json` and re-run step 4. The `production` profile
auto-increments `versionCode` for you.

---

## Option B — Local Gradle build (full offline build on your own machine)

Requires **JDK 17 + Android SDK** (≈ 5 GB). Use this if you want a fully
offline / self-contained build with no third-party service.

### 1. One-time machine setup

- **JDK 17:** install from <https://adoptium.net/> (Temurin 17).
- **Android SDK:** install Android Studio from
  <https://developer.android.com/studio>. After install, open Android Studio →
  *More Actions* → *SDK Manager* → install **Android SDK Platform 34** and
  **Android SDK Build-Tools 34.0.0**.
- Set environment variables (Linux/macOS — add to `~/.bashrc` or `~/.zshrc`):
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk        # macOS: $HOME/Library/Android/sdk
  export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
  ```

### 2. Extract the source and install dependencies

```bash
unzip coins-sale-source.zip -d coins-sale-source
cd coins-sale-source
pnpm install
```

### 3. Build the APK

```bash
cd artifacts/mobile
echo "EXPO_PUBLIC_DOMAIN=api.your-domain.com" > .env

# Generate the native android/ folder (one-time, or re-run after adding plugins):
npx expo prebuild --platform android --clean

# Build a release APK:
cd android
./gradlew assembleRelease
```

The signed APK lands at:

```
artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk
```

### 4. (Optional) Sign with your own keystore for Play Store / production

```bash
# Generate a keystore once and KEEP IT SAFE — losing it means you can never
# update the app in the Play Store again.
keytool -genkey -v -keystore my-release-key.jks -alias coinsdinesty \
        -keyalg RSA -keysize 2048 -validity 10000
```

Then point Gradle at it via `android/gradle.properties` (see Expo docs:
<https://docs.expo.dev/build-reference/apk/>).

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not connect to API` after install | `EXPO_PUBLIC_DOMAIN` was wrong — it must be a domain only (no `https://`, no `/api`). Re-build. |
| `EAS build failed: keystore` | First-time only. Choose "Generate new keystore" — EAS stores it for you. |
| `pnpm install` fails | Make sure you're on Node 20+. Run `node -v`. |
| `gradlew assembleRelease` fails on JDK 21 | Use **JDK 17** specifically — Android Gradle Plugin doesn't support JDK 21 yet. |
| APK installs but stays on splash | API server isn't reachable. Open `https://api.your-domain.com/api/health` in a browser to confirm. |

---

## What the source archive contains

The archive is the **whole pnpm monorepo** so the mobile app's workspace
dependencies all resolve. The relevant folders:

```
coins-sale-source/
├── artifacts/mobile/           ← the Expo app (this is what gets built)
│   ├── app/                    ← screens (Expo Router)
│   ├── components/             ← shared UI
│   ├── lib/                    ← API client, helpers
│   ├── assets/                 ← icons, images
│   ├── app.json                ← package id, permissions, splash, icon
│   └── eas.json                ← build profiles (preview / production)
├── lib/                        ← shared TS libraries (api-client-react, etc.)
├── pnpm-workspace.yaml
└── package.json
```

You can ignore `artifacts/api-server/` — it's the source of the backend you've
already deployed. The mobile app talks to it over HTTPS.

---

## Default login (after first install)

- **Username:** `admin`
- **Password:** `admin123`

**Change this immediately** from in-app user settings.
