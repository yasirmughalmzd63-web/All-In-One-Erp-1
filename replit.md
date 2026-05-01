# ERP PRO — Complete Business Management Mobile App

## Project Overview
A full-featured ERP (Enterprise Resource Planning) mobile application built with Expo SDK 54, Express 5 API, Drizzle ORM, and PostgreSQL. Designed for multi-location business management with real-time POS, financial tracking, and inventory control.

## Architecture

### Stack
- **Frontend**: Expo SDK 54, React Native, Expo Router 6, TanStack Query
- **Backend**: Express 5, Drizzle ORM, PostgreSQL
- **API Client**: Orval-generated React Query hooks (`@workspace/api-client-react`)
- **Monorepo**: pnpm workspaces

### Packages
- `@workspace/mobile` — Expo React Native app
- `@workspace/api-server` — Express 5 REST API
- `@workspace/db` — Drizzle ORM + schema
- `@workspace/api-zod` — Shared Zod schemas
- `@workspace/api-client-react` — Orval-generated hooks

## Key Features

### POS Screen (Core Feature)
- Custom numpad for amount entry
- **QTY = Math.round(totalAmount / unitPrice)** — auto-calculated, rounded
- Amount displayed with **8 decimal places**
- QTY is **copyable** (expo-clipboard)
- Product picker with unit price display
- Customer + Account + payment method selection
- Complete Sale with real-time stock/balance updates

### 5 Tab Navigation
1. **POS** — Point of Sale with numpad
2. **Dashboard** — Today's stats, account balances, recent sales
3. **Transactions** — Sales, Purchases, Expenses, Credits (with add forms)
4. **Stock** — Inventory management with search & CRUD
5. **More** — Access to all management screens

### Management Screens
- Customers, Suppliers (full CRUD)
- Users (with role management: admin/manager/cashier)
- Locations, Accounts, Categories, Wallets
- Credits (receivable/payable with payment recording)
- Audit Log (full activity history)

## Database Schema (14 tables)
`users`, `sessions`, `locations`, `accounts`, `categories`, `products`, `customers`, `suppliers`, `sales`, `sale_items`, `purchases`, `purchase_items`, `expenses`, `credits`, `wallets`, `audit_logs`

## Authentication
- SHA256 password hashing with salt
- Bearer token sessions (stored in AsyncStorage)
- Default credentials: `admin / admin123`, `cashier / cashier123`
- Call `POST /api/seed` to initialize data

## Multi-Tenant Data Isolation
The app supports multiple businesses sharing one database. Every business-scoped table
has a `business_id` column and routes scope reads/writes through `lib/tenant.ts`.

**Roles:**
- `super_admin` — sees and manages every business's data (no scoping). The seeded
  `admin` user is `super_admin`.
- `admin` (business owner) — sees and manages only rows belonging to their business.
  Created automatically when a business registration is approved (`businessId` =
  registration id).
- `manager`, `cashier` — same scoping as their parent business admin.

**Tables with `business_id`:**
`users`, `products`, `customers`, `suppliers`, `categories`, `accounts`,
`expenses`, `sales`.

**Helpers in `artifacts/api-server/src/lib/tenant.ts`:**
- `tenantWhere(req, col)` — WHERE clause that scopes a SELECT (super_admin = no
  filter, otherwise `col = userBusinessId` or `col IS NULL`).
- `tenantStamp(req)` — value to set on `businessId` for new rows.
- `ownsRow(req, rowBusinessId)` — guard for PATCH/DELETE; returns `false` cross-tenant.
- `andTenant(req, col, extra)` — combine tenant filter with another condition (AND).

NULL `business_id` means "main / original business" — only super_admin and users with
NULL `business_id` themselves see those rows.

## API Endpoints
All routes require Bearer token except `/api/auth/login` and `/api/seed`.

- `POST /api/auth/login` — Login
- `GET/POST /api/users` — User management
- `GET/POST /api/locations` — Locations
- `GET/POST /api/accounts` — Financial accounts
- `GET/POST /api/categories` — Product/expense categories
- `GET/POST /api/products` — Product catalog
- `GET/POST /api/customers` — Customer records
- `GET/POST /api/suppliers` — Supplier records
- `GET/POST /api/sales` — Sales transactions
- `GET/POST /api/purchases` — Purchase records
- `GET/POST /api/expenses` — Expense tracking
- `GET/POST /api/credits` — Credit management
- `POST /api/credits/:id/pay` — Record credit payment
- `GET/POST /api/wallets` — Wallet management
- `POST /api/wallets/transfer` — Wallet transfers
- `GET /api/audit` — Audit log
- `GET /api/dashboard` — Dashboard stats

## Workflows
- **API Server**: `pnpm --filter @workspace/api-server run dev` (port 8080)
- **Expo**: `pnpm --filter @workspace/mobile run dev` (port varies)

## Color Theme (Light ERP)
- Background: `#F0F4F8`
- Primary: `#2563EB` (blue)
- Header: `#1E40AF` (deep blue)
- Sale: `#16A34A` (green)
- Purchase: `#0284C7` (light blue)
- Expense: `#EA580C` (orange)
- Credit: `#7C3AED` (purple)

## File Structure
```
artifacts/
  api-server/src/
    routes/          — All 18 route files
    lib/             — auth.ts, audit.ts
    middlewares/     — requireAuth.ts
  mobile/
    app/
      _layout.tsx    — Root layout with AuthProvider
      login.tsx      — Login screen
      (tabs)/        — 5 tab screens
        index.tsx    — POS (core feature)
        dashboard.tsx
        transactions.tsx
        inventory.tsx
        more.tsx
      customers.tsx, suppliers.tsx, users.tsx
      locations.tsx, accounts.tsx, categories.tsx
      wallets.tsx, audit.tsx, credits.tsx
    context/
      AuthContext.tsx — Token management
    constants/
      colors.ts      — ERP color palette
lib/db/src/schema/   — 14 table definitions
```

## Recent Changes

### May 1, 2026 — Pivoted from Hostinger + Expo to Vercel-only deployment
- **Removed the entire Expo mobile app** at the user's request:
  - Deleted `artifacts/mobile/` (the artifact and all source).
  - The auto-generated workflow `artifacts/mobile: expo` was cleaned up automatically when the artifact directory was removed.
- **Removed all Hostinger deployment artifacts**:
  - Deleted `deploy-package/` (prebuilt bundle, Hostinger README, source archives `coins-sale-source.tar.gz`/`zip`, mobile-app README).
  - Deleted root `README.md` (Hostinger quick-start) and rewrote a fresh Vercel-focused one.
  - Removed `start` script from root `package.json` (was pointing at the deleted `deploy-package/`).
  - `.gitattributes` slimmed to just normalization rules.
  - `.gitignore` rewrote: dropped Hostinger un-ignore (`!deploy-package/api-server/dist/**`), dropped Android/APK rules, added `.vercel/`.
- **Configured the api-server to run on Vercel** as a serverless function:
  - `artifacts/api-server/src/index.ts` refactored: now exports `app` as default and only calls `app.listen(PORT)` when `PORT` env is present. Same source file works for both long-running mode (Replit, VPS) and serverless (Vercel imports the bundle and uses the default export per request).
  - New root `api/index.mjs`: Vercel-discovered function that re-exports the bundled Express app from `artifacts/api-server/dist/index.mjs`.
  - New root `vercel.json`: `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm --filter @workspace/api-server run build`, rewrites `/api` and `/api/*` to the function, `maxDuration: 30s`.
  - New root `.env.example` documenting `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV`, `PUBLIC_BASE_URL`, `UPLOADS_DIR`.
  - `artifacts/api-server/src/routes/upload.ts`: detects `process.env.VERCEL` and defaults `UPLOADS_DIR` to `/tmp/uploads` (writable but ephemeral). Comment + README warn that real persistence on Vercel needs Vercel Blob / S3 / R2.
  - `artifacts/api-server/src/app.ts`: comment updated to drop "Hostinger" reference (trust-proxy still applies, just for any upstream proxy).
- **Verified locally**: rebuilt bundle (`dist/index.mjs` 2.5 MB), `import('./api/index.mjs')` returns the Express app function, dev workflow restart succeeded, `/api/healthz` → 200.
- **Active artifacts now**: `api-server` (production target, deploys to Vercel) and `mockup-sandbox` (dev-only UI prototyping).

### May 1, 2026 — Replaced @replit/object-storage with local-FS uploads (Hostinger crash fix)
- **Bug found via Hostinger build log**: `pnpm install` succeeded at the workspace root (1137 pkgs) but the start phase would have crashed because the bundle imports `@google-cloud/storage` (transitively, via `@replit/object-storage` which esbuild bundles) and that package can't be esbuild-bundled (uses `.proto` path traversal). Hostinger has neither package installed, so `node dist/index.mjs` fails with `ERR_MODULE_NOT_FOUND: Cannot find package '@google-cloud/storage'`. Confirmed by simulating Hostinger boot in `/tmp/hostinger-sim/` against a clean dir.
- **Fix**: switched product-image and payment-proof storage from Replit object storage to local filesystem. The same bundle now runs identically on Replit, Hostinger, VPS, Docker — no cloud SDK required.
  - `artifacts/api-server/src/routes/upload.ts`: rewrote `POST /api/upload/product-image` and `POST /api/upload/product-image-refresh` to write/read files under `process.env.UPLOADS_DIR ?? ./uploads`. Returns absolute URL `${PUBLIC_BASE_URL or req-derived}/api/uploads/<key>`. Path-traversal-safe (`..` and absolute keys rejected on refresh).
  - `artifacts/api-server/src/app.ts`: added `app.set("trust proxy", 1)` so `req.protocol` returns `https` behind Hostinger's reverse proxy. Mounted `express.static(UPLOADS_DIR)` at `/api/uploads` with 1-day cache. Bumped `express.json({ limit: "20mb" })` and `urlencoded({ limit: "20mb" })` to fit base64 image payloads (was crashing silently at the default 100kb).
  - `artifacts/api-server/package.json`: removed `@google-cloud/storage` and `@replit/object-storage` from `dependencies`. `pnpm install` removed 50 transitive packages.
  - `deploy-package/api-server/.env.example`: replaced the dead `DEFAULT_OBJECT_STORAGE_BUCKET_ID` block with `UPLOADS_DIR=./uploads` (recommended: persistent path outside app folder) and optional `PUBLIC_BASE_URL=https://api.your-domain.com`.
  - `deploy-package/api-server/README.md` and root `README.md`: documented the new env vars and that uploads work out-of-the-box on any Node host with no cloud SDK.
- **End-to-end smoke test passed** (against dev server at `localhost:80`):
  - `POST /api/auth/login admin/admin123` → token
  - `POST /api/upload/product-image` (1×1 transparent PNG, base64) → `{url, key}` with absolute URL
  - `GET /api/uploads/<key>` → HTTP 200, content-type `image/png`, 68 bytes
  - `POST /api/upload/product-image-refresh` → returns same URL
- **Hostinger boot simulation passed**: copied `deploy-package/api-server/` to `/tmp/hostinger-sim/` (no `node_modules`), ran `npm start` → server listening, `/api/healthz` → 200, `/api/uploads/missing.jpg` → 404 (no crash).
- Rebuilt deploy bundle: `api-server/dist/index.mjs` (2.5 MB), `coins-sale-source.tar.gz` (1.6 MB), `coins-sale-source.zip` (1.8 MB).

### May 1, 2026 — Root `start` script for Hostinger root-mounted deploys
- Added `"start": "node --enable-source-maps ./deploy-package/api-server/dist/index.mjs"` to the root `package.json` so Hostinger works whether Application Root is set to the repo root OR to `deploy-package/api-server`. README updated with both configs (repo-subfolder root recommended for fastest install).

### May 1, 2026 — GitHub-ready repo (Hostinger one-click deploy)
- Rewrote `.gitignore` to make the repo clean for `git push origin main` and seamless Hostinger Node.js deployment from GitHub:
  - **Un-ignored** `deploy-package/api-server/dist/**` so the prebuilt ESM bundle (`index.mjs`) ships to GitHub. Hostinger never runs `npm install`/`build` — it just runs `node dist/index.mjs`.
  - Added explicit ignores for `.env*` (with `!.env.example`), `*.pem`, `*.key`, `*.apk`, `*.aab`, `*.keystore`.
  - Added ignores for Android build folders (`artifacts/mobile/android/{build,app/build,.gradle}`) and `attached_assets/`, `replit.md`, `.replit`, `.replitignore`, `.local/`, `.cache/`, `.agents/` (Replit-only clutter; FUTURE additions stay out — already-tracked ones need a one-shot `git rm -r --cached` documented in the README).
  - Other dist/ folders (e.g. `artifacts/api-server/dist/`) stay ignored.
- Added `.gitattributes`: `* text=auto eol=lf` (LF line endings on Linux/Hostinger regardless of Windows/macOS pushes) plus binary attributes for `*.mjs(.map)` bundle, `*.tar.gz/zip`, images, and APK files.
- Created root `README.md` with the GitHub→Hostinger quickstart: 5-minute deploy steps (set Application Root = `deploy-package/api-server`, Startup file = `dist/index.mjs`, Node 20+, env vars), what-gets-pushed/ignored explanation, optional cleanup command for legacy Replit files, mobile APK build flow, and update-and-redeploy workflow.
- Verified: `deploy-package/api-server/dist/index.mjs` (2.6 MB) is tracked; `.env`, `attached_assets/sample.png`, `artifacts/api-server/dist/`, `node_modules/`, Android build dirs are ignored.

### May 1, 2026 — Allow account balances to go negative (removed "Insufficient funds" 422 gates)
- Per user request: when a selected account has less balance than the deduct amount, do NOT block with red error. Instead let the transaction proceed and let the account balance go negative (deficit shown in the account's record). Removed the `acctBal < amount` 422 guards in 5 places, keeping all other checks (account exists, tenant ownership, isActive) intact:
  - `usd-bridge.ts` (cash leg of USDT Bridge sale)
  - `purchases.ts` (paying supplier from PKR account)
  - `expenses.ts` (paying expense from PKR account)
  - `accounts.ts` (account-to-account transfer; preserved the `fromBal` arithmetic that updates balance)
  - `dollar-wallet.ts` (PKR-account leg of Buy USD; deliberately LEFT the wallet-to-wallet USD `Insufficient balance` check at line ~582 since that's USD wallet stock, not a PKR account).
- Architect review PASSED: no stale variable references, tenant scoping intact, balance update arithmetic produces clean negatives in numeric/decimal columns.
- Rebuilt deploy bundle: `api-server/dist/index.mjs` (2.6 MB), `coins-sale-source.tar.gz` (1.6 MB), `coins-sale-source.zip` (1.8 MB).

### May 1, 2026 — USDT Bridge fixes (UI value + inventory ledger inclusion)
- **UI fix** (`artifacts/mobile/app/usd-bridge.tsx`): Coins payment "Value" displayed ₨0 because Product type read `.price` but `/api/products` returns `unitPrice`. Updated interface + `coinsPkr` calc + product picker subtext to read `unitPrice` (with `price` fallback).
- **Inventory ledger fix** (`artifacts/api-server/src/routes/dashboard.ts /api/inventory/ledger`): USDT-Bridge product OUT (coins-as-payment) and credit `coins_withdraw` payments were decrementing `productsTable.stock` directly without inserting into `salesTable`, so they were INVISIBLE in the inventory in/out ledger. Added 4 new aggregations (in-range + after-end for both sources) and merged into the SOLD column at PKR sale-price value (`usd_purchases.coinsPkr` and `credit_payments.productValuePkr ?? amount`). `balanceAtEnd` back-walk now also reverses USD/credit outflows after end. Tenant-scoped via `tenantWhere(... .businessId)`. Architect review PASSED.
- Rebuilt deploy bundle: `api-server/dist/index.mjs` (2.6 MB), `coins-sale-source.tar.gz` (1.6 MB), `coins-sale-source.zip` (1.8 MB).

### Apr 30, 2026 — Self-host deployment package + multi-tenant scoping completion
- Finished multi-tenant scoping pass: `dollar-wallet.ts` (all account/wallet/supplier/customer/product/dwEntry lookups now use `ownsRow`), `cash-management.ts /accounts` (added `tenantWhere`), `dashboard.ts` (both locations queries scoped).
- **Critical bug fix:** `...tenantStamp(req)` was silently dropping `businessId` from inserts because `tenantStamp` returns `number|null`, not an object. Replaced 9 spread-call sites in `dollar-wallet.ts` and `app-wallets.ts` with `businessId: tenantStamp(req)`.
- Built deploy bundle at `deploy-package/`:
  - `api-server/dist/index.mjs` (2.5 MB, single-file ESM bundle, no `node_modules` needed)
  - `api-server/schema.sql` (518 lines, schema only — no data; via `drizzle-kit export`)
  - `api-server/.env.example`, `package.json`, `README.md` (Hostinger Node.js setup)
  - `coins-sale-source.tar.gz` (1.6 MB, full monorepo source for re-building APK)
  - `MOBILE_APP_README.md` + `eas.json` (EAS Build instructions for Android APK)
  - Top-level `README.md` covering both pieces.

### Apr 30, 2026 — Payment screenshot verification + dollar-wallet query optimization
- Added `payment_proof_url`, `payment_proof_key`, `proof_verified_at`, `proof_verified_by` columns to `dollar_wallet` for attaching bank/Jazz Cash/EasyPaisa transfer screenshots to USD purchases.
- Added DB indexes `(entry_type, created_at)` and `(wallet_id, created_at)` on `dollar_wallet` for fast list/filter queries.
- `GET /api/dollar-wallet` now supports `?entryType=&limit=&offset=` (default limit 500, max 1000) and the mobile app fetches just the latest 200 by default.
- `POST /api/dollar-wallet/purchase` now accepts and stores `paymentProofUrl` and `paymentProofKey`.
- New admin-only routes `POST /api/dollar-wallet/:id/verify-proof` and `POST /api/dollar-wallet/:id/unverify-proof`.
- Mobile Buy USD modal: dashed "Attach Payment Screenshot" picker + thumbnail preview/remove. Uploads via existing `/api/upload/product-image`.
- Mobile transactions list: shows pending/verified badge with thumb on entries that have a proof. Tapping opens a full-screen image viewer with zoom (admins see Verify / Unverify button).

### Apr 30, 2026 — Payment screenshot compression + wallet rename
- **Compression**: Added `expo-image-manipulator` to the mobile app. `pickAndUploadProof` now resizes payment screenshots down to max 1280px wide and re-encodes them as JPEG at ~60% quality before uploading. This typically takes a 2-8 MB phone-gallery shot down to ~80-200 KB — much faster on slow connections and far less storage usage.
- **Rename wallets**: Long-pressing a wallet card on the Dollar Wallet screen opens a Rename modal. New backend route `PATCH /api/wallets/:id` (auth-required) updates the wallet name, validates non-empty, and writes an audit log entry like `Renamed "X" → "Y"`. The local wallet list updates in place — no full reload needed.

### Apr 30, 2026 — Admin Reset Center
- New screen `artifacts/mobile/app/reset-center.tsx` accessible from More → Reports → "Reset Center" (admin only).
- Backend: `artifacts/api-server/src/routes/admin-reset.ts` adds two endpoints, both admin-only:
  - `GET /api/admin/reset/counts` returns current row counts for every category.
  - `POST /api/admin/reset/:category` requires body `{ confirm: "RESET" }` and wipes that category, writing an audit-log entry like `Cleared <Label> (N rows)`.
- Categories: sales, purchases, expenses, credits (PKR), dollar-wallet (also resets wallet balances), app-wallets (USDT topups + coin credits), stock-transfers, cash-counts, currencies, hrm (attendance/payroll/bonuses/fines/leaves), audit-logs, account-balances → 0, product-stock → 0.
- Special category `all-transactions` runs every category except audit-logs in sequence.
- UI safety: each clear opens a confirm modal that requires typing **RESET** to enable the Clear Now button. Master data (users, customers, suppliers, products, accounts, wallets, employees) is never deleted by these actions.

### May 1, 2026 — Cash Management user/app filters
- Backend `GET /api/cash-management/statement` now also accepts optional `userId` and `productId` query params.
  - `userId` filters every source-of-funds (sales, purchases, expenses, credit_payments).
  - `productId` ("App") filters sales via a `saleItems` subquery and credit_payments via its `productId` column; purchases/expenses are excluded when this filter is on (no product concept).
  - Each entry now also returns `userId` + `userName`, resolved via a single tenant-scoped batch lookup on `usersTable` (no per-row query).
- Mobile `cash-management.tsx`:
  - New top filter chip row showing **USER** and **APP** with x-circle clear buttons; opens bottom-sheet pickers.
  - "All time" preset added to the date filter modal (sets `from` to 2000-01-01).
  - Account tabs polished: larger icons, color-matched active background, soft shadow.
  - Per-row user label (`👤 name`) appended to date line.
  - Share/CSV export now includes the active User and App filter context plus a User column.
