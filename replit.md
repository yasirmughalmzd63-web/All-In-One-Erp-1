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

### Apr 30, 2026 — Payment screenshot verification + dollar-wallet query optimization
- Added `payment_proof_url`, `payment_proof_key`, `proof_verified_at`, `proof_verified_by` columns to `dollar_wallet` for attaching bank/Jazz Cash/EasyPaisa transfer screenshots to USD purchases.
- Added DB indexes `(entry_type, created_at)` and `(wallet_id, created_at)` on `dollar_wallet` for fast list/filter queries.
- `GET /api/dollar-wallet` now supports `?entryType=&limit=&offset=` (default limit 500, max 1000) and the mobile app fetches just the latest 200 by default.
- `POST /api/dollar-wallet/purchase` now accepts and stores `paymentProofUrl` and `paymentProofKey`.
- New admin-only routes `POST /api/dollar-wallet/:id/verify-proof` and `POST /api/dollar-wallet/:id/unverify-proof`.
- Mobile Buy USD modal: dashed "Attach Payment Screenshot" picker + thumbnail preview/remove. Uploads via existing `/api/upload/product-image`.
- Mobile transactions list: shows pending/verified badge with thumb on entries that have a proof. Tapping opens a full-screen image viewer with zoom (admins see Verify / Unverify button).
