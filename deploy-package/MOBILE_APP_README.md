# Coins Sale ERP — Mobile App (Build the APK)

The mobile app is a React Native / Expo project. To get a working `.apk` file
you have two options:

## Option A — Build in the cloud with EAS (recommended)

EAS Build is Expo's free build service (free tier covers a handful of builds
per month — enough for testing). You don't need any Android SDK or Java setup.

### 1. Install Node.js 20+ and pnpm
```bash
# macOS (Homebrew)
brew install node@20 pnpm
# Linux / WSL
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### 2. Extract the source and install dependencies
```bash
tar -xzf coins-sale-source.tar.gz -C coins-sale-source && cd coins-sale-source
# (or, on Windows: use 7-Zip / WinRAR to extract the .tar.gz)
pnpm install
```

### 3. Point the app at your API server
Open `artifacts/mobile/eas.json` and set `EXPO_PUBLIC_DOMAIN` to the **bare
domain** (no `https://`) where you deployed the API server:
```json
"env": { "EXPO_PUBLIC_DOMAIN": "api.your-domain.com" }
```
There are **two** spots — one under `preview`, one under `production`. Update
both.

### 4. Log in to Expo (free account at expo.dev) and build the APK
```bash
cd artifacts/mobile
npx eas-cli login           # creates a free account if you don't have one
npx eas-cli build:configure # one-time, picks Android
npx eas-cli build --profile preview --platform android
```

EAS will print a build URL. Wait ~10–15 minutes, then download the `.apk` file.
Sideload it onto any Android device.

### 5. Update later
Whenever you change the API URL or release a new version, just re-run
`npx eas-cli build --profile preview --platform android`.

---

## Option B — Build locally on your own machine

Requires **Android Studio + JDK 17 + Android SDK** installed.

```bash
unzip coins-sale-source.zip
cd coins-sale-source
pnpm install

cd artifacts/mobile
EXPO_PUBLIC_DOMAIN=api.your-domain.com npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The signed `.apk` ends up at:
```
artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## What the source zip contains

The zip is the **whole pnpm monorepo** so the mobile app's workspace
dependencies (`@workspace/api-client-react`, `@workspace/api-zod`,
`@workspace/db`) all resolve correctly. Folders:

```
coins-sale-source/
├── artifacts/
│   ├── mobile/              ← the React Native app (this is what you build)
│   ├── api-server/          ← the backend (you should already have it deployed)
│   └── mockup-sandbox/      ← internal design preview tool, ignore
├── lib/
│   ├── api-client-react/    ← generated React Query hooks (auto-generated)
│   ├── api-spec/            ← OpenAPI source of truth
│   ├── api-zod/             ← generated Zod validators
│   └── db/                  ← Drizzle schema (used by api-server)
├── package.json             ← monorepo root
├── pnpm-workspace.yaml
└── ...
```

You **only** need to touch `artifacts/mobile/` for normal app changes.
Re-generate the API client with `pnpm --filter @workspace/api-spec run codegen`
if you add/change backend routes.

---

## Default login

The app talks to your self-hosted API. Use whatever super-admin user you
INSERTed during the API setup (see the api-server README, step 1). Out of the
box this is `admin` / `admin123` — **change it immediately after first login**.

---

## Troubleshooting

| Symptom                                                        | Fix                                                                              |
|----------------------------------------------------------------|----------------------------------------------------------------------------------|
| EAS build fails with "credential" error                        | Run `npx eas-cli credentials` and let it auto-generate an Android keystore        |
| App opens but shows "Network request failed" on login          | Wrong `EXPO_PUBLIC_DOMAIN` in `eas.json`, or API isn't reachable over HTTPS       |
| Login succeeds in browser preview but not on device            | Device cannot reach `https://api.your-domain.com` — check DNS / firewall          |
| `pnpm install` fails complaining about `react-native` versions | Make sure you're on Node 20+ and pnpm 9+                                          |
