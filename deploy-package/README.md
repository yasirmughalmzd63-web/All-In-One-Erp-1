# Coins Sale ERP — Deployment Package

This folder contains everything you need to run the **Coins Sale ERP** on your
own infrastructure (Hostinger Node.js hosting, a VPS, or any Node 20+ server).

## What's inside

```
deploy-package/
├── api-server/                ← pre-built backend, ready to run on Hostinger
│   ├── dist/                  ← bundled Node.js server (no npm install needed)
│   ├── schema.sql             ← run ONCE on a fresh PostgreSQL DB
│   ├── package.json
│   ├── .env.example
│   └── README.md              ← full backend deployment guide
│
├── coins-sale-source.tar.gz   ← mobile app source (the whole monorepo)
└── MOBILE_APP_README.md       ← how to build the .apk from the source
```

## Recommended order

1. **Deploy the API server first.** Open `api-server/README.md` and follow the
   five steps. After this you should have an HTTPS URL like
   `https://api.your-domain.com/api/health` returning `{"ok": true}`.

2. **Then build the mobile APK.** Extract the source tarball, set the API URL,
   and run an EAS build. Full instructions are in `MOBILE_APP_README.md`.

3. **Install the APK** on any Android device (sideload it or distribute via
   Google Play / a private link). Log in with the super-admin you created when
   you ran `schema.sql`.

## Default credentials

After running `schema.sql` and the super-admin INSERT in the api-server README,
you can log in with:

- **Username:** `admin`
- **Password:** `admin123`

**Change this password immediately** from the in-app user settings.

## Architecture summary

- **Backend:** single bundled ESM file (`dist/index.mjs`), Express + Drizzle +
  PostgreSQL. Multi-tenant — every business gets its own isolated dataset.
- **Frontend:** React Native (Expo). Talks to the backend over HTTPS.
- **Database:** PostgreSQL 14+. Schema is exported via `drizzle-kit export` and
  contains zero rows by default — you start with a clean slate.
- **No Replit dependencies** at runtime. The app runs on any Linux host.

## Total size on your server

- API server (with source maps): ~10 MB unpacked
- API server (without source maps — delete `*.map` after upload): ~3 MB
- Database after first import: a few hundred kilobytes (just empty tables)

## Need to update later?

Re-run `pnpm --filter @workspace/api-server run build` from the source repo,
then copy `artifacts/api-server/dist/*` over the existing `api-server/dist/` on
Hostinger and restart the Node app. No DB migration needed unless the schema
changed.
