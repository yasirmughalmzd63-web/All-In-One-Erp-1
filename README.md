# Coins Sale — API Server

Backend for a coin-selling business (PUBG UC, FreeFire Diamonds, etc.) — Express + Drizzle + PostgreSQL, designed to run as a Vercel serverless function or any standard Node.js host.

## Project layout

```
.
├── api/index.mjs              ← Vercel serverless entry (re-exports the bundled app)
├── vercel.json                ← Vercel build + routing config
├── artifacts/
│   ├── api-server/            ← Express app source + esbuild bundle
│   └── mockup-sandbox/        ← (dev only) UI prototyping sandbox
├── lib/                       ← Shared TypeScript libs (db schema, zod schemas, etc.)
├── pnpm-workspace.yaml
└── package.json
```

## Local development

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

The server listens on `http://localhost:8080` with all routes under `/api`
(e.g. `/api/healthz`).

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, **New Project → Import** the repo. Leave the framework preset on **Other** — Vercel will read `vercel.json` from the repo root.
3. Add environment variables in **Project → Settings → Environment Variables**:

   | Name             | Value                                                                                                                |
   |------------------|----------------------------------------------------------------------------------------------------------------------|
   | `DATABASE_URL`   | Postgres connection string (Neon, Supabase, Vercel Postgres, etc.)                                                   |
   | `SESSION_SECRET` | Long random string (≥ 32 chars)                                                                                      |
   | `NODE_ENV`       | `production`                                                                                                         |
   | `PUBLIC_BASE_URL`| *(optional)* Your Vercel URL, e.g. `https://your-app.vercel.app`. Leave blank to derive from the request.            |

4. Deploy. Vercel will run:
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @workspace/api-server run build` (produces `artifacts/api-server/dist/index.mjs`)
   - Wrap `api/index.mjs` as a Node serverless function.

5. Verify: `https://your-app.vercel.app/api/healthz` should return `{"status":"ok"}`.

### About the database on Vercel

Each serverless cold start opens a fresh Postgres pool, so an unpooled
connection string can exhaust your DB's connection limit under load. **Use a
pooled connection string.** Most managed Postgres providers offer one:

- **Neon** — use the URL ending in `-pooler.<region>.aws.neon.tech` (PgBouncer in transaction mode).
- **Supabase** — use the **Connection pooling** URL (port `6543`, `pgbouncer=true`).
- **Vercel Postgres** — the default `POSTGRES_URL` is already pooled; use that one (not `POSTGRES_URL_NON_POOLING`).
- **Self-hosted** — front your DB with PgBouncer and point `DATABASE_URL` at it.

### About image uploads on Vercel

The `/api/upload/product-image` route writes files to disk. **Vercel's
filesystem is read-only at runtime — only `/tmp` is writable, and `/tmp`
is per-invocation and not shared across instances.** The route automatically
defaults to `/tmp/uploads` on Vercel so calls don't error, but uploaded
files will disappear minutes later.

For real persistence on Vercel you must swap the upload route for a real
object store. Recommended choices:

- **Vercel Blob** — easiest, just `npm i @vercel/blob` and replace the
  `fs.writeFile` call with `put(key, buffer, { access: "public" })`.
- **AWS S3 / Cloudflare R2** — works the same with the `@aws-sdk/client-s3`
  package (R2 is S3-compatible).

The relevant file is `artifacts/api-server/src/routes/upload.ts`.

## Deploying to a traditional Node host

Anywhere that runs Node ≥ 20 with a writable filesystem (VPS, Docker, Render, Railway, Fly.io, etc.):

```bash
pnpm install --prod
pnpm --filter @workspace/api-server run build
PORT=8080 DATABASE_URL=... SESSION_SECRET=... node --enable-source-maps artifacts/api-server/dist/index.mjs
```

For these hosts, set `UPLOADS_DIR` to a persistent path (e.g. `/var/data/uploads`) so product images survive restarts and redeploys.
