# Coins Sale ERP

Multi-tenant ERP for coin-selling businesses (PUBG UC, FreeFire Diamonds, etc.).
Mobile app (Android) backed by a self-hosted Node.js + PostgreSQL API.

---

## What's in this repo

```
coins-sale/
├── deploy-package/          ← READY-TO-DEPLOY backend + mobile build files
│   ├── api-server/          ← pre-built Node.js bundle (start with `npm start`)
│   │   ├── dist/index.mjs   ← single-file ESM bundle (no npm install needed)
│   │   ├── schema.sql       ← PostgreSQL schema (run ONCE on a fresh DB)
│   │   ├── package.json
│   │   ├── .env.example
│   │   └── README.md        ← full Hostinger deployment guide
│   ├── coins-sale-source.tar.gz   ← mobile app source for building APK
│   ├── coins-sale-source.zip      ← same, in zip format
│   ├── MOBILE_APP_README.md       ← APK build instructions
│   └── README.md
│
├── artifacts/               ← source code (mobile app + API server)
│   ├── mobile/              ← Expo / React Native app
│   └── api-server/          ← Express + Drizzle backend (source)
├── lib/                     ← shared TypeScript libraries
└── pnpm-workspace.yaml
```

---

## Deploy on Hostinger Node.js (5 minutes)

You only need the contents of **`deploy-package/api-server/`** on Hostinger —
the rest of the repo is the source code (used to rebuild the bundle when you
change something).

### Quickstart

1. **Push this repo to GitHub** (see "Push to GitHub" below).
2. In Hostinger control panel → **PostgreSQL** → create a database.
   Run `deploy-package/api-server/schema.sql` against it once.
3. In Hostinger → **Node.js** → create a new app:
   - **Git repo:** your GitHub repo URL
   - **Branch:** `main`
   - **Application root:** `deploy-package/api-server`
   - **Startup file:** `dist/index.mjs`
   - **Node.js version:** 20.x or later
4. In the Node.js app's **Environment Variables** tab, set:
   - `DATABASE_URL` — the Postgres URL from step 2
   - `NODE_ENV` — `production`
   - `SESSION_SECRET` — any long random string (≥ 32 chars)
   - `PORT` — usually auto-assigned by Hostinger; leave blank if so
5. Click **Start App**. Visit `https://your-domain.com/api/health` — it should
   return `{"ok": true, ...}`.

Full step-by-step (with screenshots-style guidance) is in
**`deploy-package/api-server/README.md`**.

> The bundle in `deploy-package/api-server/dist/` is committed to the repo on
> purpose. Hostinger does **not** need to run `npm install` or build anything —
> it just runs `node dist/index.mjs`.

---

## Push to GitHub

From your local machine (or this Replit shell):

```bash
# one-time setup — replace with YOUR repo URL
git remote add origin https://github.com/<your-user>/coins-sale.git

# push
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

If `origin` already exists (e.g. you cloned from GitHub), just:

```bash
git add .
git commit -m "Update"
git push
```

### What gets pushed vs ignored

`.gitignore` is configured so the repo stays clean and Hostinger-deployable:

**Pushed to GitHub** (so Hostinger can run it):
- All source code (`artifacts/`, `lib/`)
- The pre-built backend bundle: `deploy-package/api-server/dist/`
- Schema, env example, READMEs

**Ignored** (kept out of GitHub):
- `node_modules/` (Hostinger / your machine reinstall as needed)
- `.env` files (secrets — only `.env.example` is pushed)
- `attached_assets/`, `replit.md`, `.replit`, `.local/`, `.cache/` (Replit-only)
- `artifacts/api-server/dist/` (dev build output — only the deploy-package
  bundle is tracked)
- Android build folders, `*.apk`, `*.keystore` (rebuild locally)

### Optional: clean up old Replit-only files already in git history

If your repo was first created in Replit, these files (`attached_assets/`,
`.replit`, `.replitignore`, `.agents/`) were committed before the new
`.gitignore` rules existed. They are **harmless** — Hostinger never sees them
because its application root is `deploy-package/api-server/`. But if you want
a pristine GitHub repo, run this once on your machine:

```bash
git rm -r --cached attached_assets .agents .replit .replitignore 2>/dev/null
git commit -m "Remove Replit-only files from repo"
git push
```

(The files stay on disk; only the GitHub copy is removed.)

---

## Build the mobile APK

See **`deploy-package/MOBILE_APP_README.md`** for the EAS Build flow. Short
version:

```bash
cd artifacts/mobile
# point the app at your deployed API
echo "EXPO_PUBLIC_API_BASE_URL=https://your-domain.com" >> .env
npx eas-cli build -p android --profile preview
```

You'll get an `.apk` you can sideload on any Android device.

---

## Default login

After running `schema.sql` and the super-admin INSERT (in
`deploy-package/api-server/README.md` step 1), log in with:

- **Username:** `admin`
- **Password:** `admin123`

**Change this password immediately** from in-app user settings.

---

## Updating the backend later

When you change server code:

```bash
pnpm install
pnpm --filter @workspace/api-server run build
cp artifacts/api-server/dist/* deploy-package/api-server/dist/
git add deploy-package/api-server/dist/
git commit -m "Rebuild backend"
git push
```

Then in the Hostinger Node.js panel click **Restart App**. No DB migration is
needed unless you changed the schema.

---

## Tech stack

- **Mobile:** Expo / React Native, TypeScript
- **Backend:** Node.js 20+, Express, Drizzle ORM, PostgreSQL 14+
- **Auth:** SHA-256 + salt, bearer tokens, multi-tenant business isolation
- **Build:** pnpm monorepo, esbuild (single-file ESM bundle)

No Replit dependencies at runtime. Runs on any Linux Node.js host.
