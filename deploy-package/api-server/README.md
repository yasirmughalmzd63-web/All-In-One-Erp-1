# Coins Sale ERP — API Server (Hostinger Node.js Deployment)

This folder contains the **pre-built backend** for the Coins Sale ERP. Everything
is bundled into a single ESM file (`dist/index.mjs`) — you do **not** need to
install npm packages on Hostinger. Just upload, configure `.env`, and start.

---

## What's in this folder

```
api-server/
├── dist/                ← pre-bundled Node.js server (ready to run)
│   ├── index.mjs        ← main entry — start with `node dist/index.mjs`
│   ├── pino-*.mjs       ← logging worker files (must be next to index.mjs)
│   └── *.map            ← source maps (delete to save ~5 MB if you want)
├── package.json         ← declares the start script
├── .env.example         ← copy → `.env` and fill in
├── schema.sql           ← run ONCE on a fresh PostgreSQL DB
└── README.md            ← this file
```

---

## Step 1 — Create the PostgreSQL database

1. In Hostinger control panel → **Databases** → **PostgreSQL** → create a new DB.
2. Note the **host, port, user, password, dbname** — you'll need them in step 3.
3. Connect with `psql` (or pgAdmin, or Hostinger's web SQL tool) and run:

   ```bash
   psql "postgres://USER:PASSWORD@HOST:PORT/DBNAME" -f schema.sql
   ```

   This creates **all tables, indexes, and constraints** with **NO data**.

4. **Create the first super-admin user** (the app cannot be used without one):

   ```sql
   -- Default credentials: admin / admin123 (CHANGE THE PASSWORD after first login)
   INSERT INTO users (username, name, password_hash, role, business_id, is_active)
   VALUES (
     'admin',
     'Super Admin',
     'a20142bbaf46e6b21ed82e64f060077b0ab950120aef8606dd7fc8f000a993f6',
     'super_admin',
     NULL,
     true
   );
   ```

   To generate the hash for a different password, run:
   ```bash
   node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD' + 'erp_salt_2024').digest('hex'))"
   ```

   Then INSERT with that hash instead of the one above.

---

## Step 2 — Upload the files

Upload the **entire `api-server` folder** to your Hostinger account (via SFTP,
File Manager, or `scp`). Recommended location:

```
/home/<your-user>/coins-sale/api-server/
```

---

## Step 3 — Configure environment variables

Copy `.env.example` → `.env` and fill in **at minimum**:

| Variable          | What to set it to                                                                |
|-------------------|----------------------------------------------------------------------------------|
| `DATABASE_URL`    | The Postgres URL from step 1                                                     |
| `PORT`            | Use the port Hostinger gave you (often 8080 or auto-assigned)                    |
| `NODE_ENV`        | `production`                                                                     |
| `SESSION_SECRET`  | Any long random string (≥ 32 chars)                                              |
| `UPLOADS_DIR`     | Folder to store product images & payment-proof screenshots (e.g. `/home/<hostinger-user>/coins-sale-uploads`). Defaults to `./uploads`. Use a path **outside** the app folder so files survive redeploys. |
| `PUBLIC_BASE_URL` | *(optional)* Your public HTTPS base URL, e.g. `https://api.your-domain.com`. If blank, derived from the incoming request — usually fine on Hostinger. |

The server always exposes its routes under the path `/api` (this is hardcoded —
the mobile app expects it). Your reverse proxy / Hostinger app URL just needs
to forward all traffic to the Node process.

**Image storage:** product images and payment-proof screenshots are saved to
`UPLOADS_DIR` and served at `https://<your-domain>/api/uploads/<key>`. No
cloud SDK is required — uploads work out of the box on any Node host.

---

## Step 4 — Start the server on Hostinger

In the Hostinger Node.js panel:

- **Application root:** the folder you uploaded to (e.g. `coins-sale/api-server`)
- **Application URL:** your domain or subdomain (e.g. `api.example.com`)
- **Application startup file:** `dist/index.mjs`
- **Node.js version:** **20.x or later** (required)

Click **Start App**. Hostinger will run `node dist/index.mjs` for you.

To check the API is alive, visit:

```
https://your-domain.com/api/health
```

You should see something like `{"ok": true, "timestamp": "..."}`.

---

## Step 5 — Point the mobile app at your API

In the mobile source (zip file), open `app.config.ts` and set:

```ts
EXPO_PUBLIC_API_BASE_URL = "https://your-domain.com"
```

Then rebuild the APK (see the mobile README).

---

## Updating later

Whenever you change backend code:

1. Re-bundle on your dev machine: `pnpm --filter @workspace/api-server run build`
2. Copy `artifacts/api-server/dist/*` → `coins-sale/api-server/dist/` on Hostinger
3. Restart the Node app from the Hostinger panel

You do **not** need to re-run `schema.sql` unless you've added new tables.

---

## Troubleshooting

| Symptom                                       | Likely cause / fix                                                     |
|-----------------------------------------------|------------------------------------------------------------------------|
| `ECONNREFUSED` to Postgres                    | Wrong `DATABASE_URL` host/port, or DB not started                      |
| `relation "users" does not exist`             | You forgot to run `schema.sql` on the database                         |
| Mobile app says "Network request failed"      | `EXPO_PUBLIC_API_BASE_URL` in the APK doesn't match your API URL       |
| `Login failed` for `admin / admin123`         | You skipped the manual super-admin INSERT in step 1                    |
| Upload-proof routes return 500                | Storage env vars are empty — see `.env.example` "Optional" section     |
