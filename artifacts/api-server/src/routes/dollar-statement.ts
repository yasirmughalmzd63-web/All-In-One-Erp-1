import { Router } from "express";
import { and, gte, lte, eq } from "drizzle-orm";
import {
  db, usdPurchasesTable, dollarWalletTable, walletsTable, locationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";

const router = Router();

/* ─────────────────────────────────────────────────────────────────────────
   GET /dollar-statement
   Comprehensive USD / USDT statement:
     – USD purchases from customers (usd_purchases)
     – Dollar wallet ledger (dollar_wallet)
     – Wallet balances (wallets)
     – Location-wise aggregation

   Query params:
     from          YYYY-MM-DD  (default: 30 days ago)
     to            YYYY-MM-DD  (default: today)
     locationId    number      (admin only; filter by app/location)
     walletId      number      (filter ledger by specific wallet)
───────────────────────────────────────────────────────────────────────── */
router.get("/dollar-statement", requireAuth, async (req, res): Promise<void> => {
  const fromStr = (req.query["from"] as string | undefined) ?? "";
  const toStr   = (req.query["to"]   as string | undefined) ?? "";
  const wIdParam = req.query["walletId"] ? parseInt(String(req.query["walletId"]), 10) : null;

  const fromDate = fromStr ? new Date(fromStr + "T00:00:00Z") : null;
  const toDate   = toStr   ? new Date(toStr   + "T23:59:59Z") : null;

  /* location scope */
  const adminUser = isAdmin(req);
  const scopeLocId = adminUser
    ? (req.query["locationId"] ? parseInt(String(req.query["locationId"]), 10) : null)
    : (req.userLocationId ?? null);

  /* ── USD Purchases from customers (USD Bridge) ── */
  const purchaseConds = [];
  if (fromDate) purchaseConds.push(gte(usdPurchasesTable.createdAt, fromDate));
  if (toDate)   purchaseConds.push(lte(usdPurchasesTable.createdAt, toDate));
  if (scopeLocId) purchaseConds.push(eq(usdPurchasesTable.locationId, scopeLocId));

  const purchases = await db.select().from(usdPurchasesTable)
    .where(purchaseConds.length ? and(...purchaseConds) : undefined)
    .orderBy(usdPurchasesTable.createdAt);

  /* ── Dollar Wallet ledger entries ── */
  const ledgerConds = [];
  if (fromDate)  ledgerConds.push(gte(dollarWalletTable.createdAt, fromDate));
  if (toDate)    ledgerConds.push(lte(dollarWalletTable.createdAt, toDate));
  if (wIdParam)  ledgerConds.push(eq(dollarWalletTable.walletId, wIdParam));

  const ledger = await db.select().from(dollarWalletTable)
    .where(ledgerConds.length ? and(...ledgerConds) : undefined)
    .orderBy(dollarWalletTable.createdAt);

  /* ── USD Wallets ── */
  const wallets = await db.select().from(walletsTable)
    .where(eq(walletsTable.currency, "USD"));

  /* ── All active locations ── */
  const locations = await db.select().from(locationsTable);

  /* ── Purchase summary totals ── */
  const totPurchUsd    = purchases.reduce((s, r) => s + parseFloat(r.dollarAmount), 0);
  const totPurchPkr    = purchases.reduce((s, r) => s + parseFloat(r.totalPkr),    0);
  const totCoinsPkr    = purchases.reduce((s, r) => s + parseFloat(r.coinsPkr),    0);
  const totCashPkr     = purchases.reduce((s, r) => s + parseFloat(r.cashPkr),     0);
  const totCreditPkr   = purchases.reduce((s, r) => s + parseFloat(r.creditPkr),   0);
  const totCoinsQty    = purchases.reduce((s, r) => s + parseFloat(r.coinsQty ?? "0"), 0);

  /* ── Ledger summary ── */
  const IN_TYPES  = new Set(["received", "partial", "recovery", "purchase", "transfer_in"]);
  const OUT_TYPES = new Set(["product", "topup", "transfer_out"]);
  const totLedgerIn  = ledger.filter(e => IN_TYPES.has(e.entryType)).reduce((s, e) => s + parseFloat(e.amountUsd), 0);
  const totLedgerOut = ledger.filter(e => OUT_TYPES.has(e.entryType)).reduce((s, e) => s + parseFloat(e.amountUsd), 0);

  /* ── Wallet balances total ── */
  const walletBalUsd = wallets.reduce((s, w) => s + parseFloat(w.balance), 0);

  /* ── Location-wise breakdown of purchases ── */
  const locMap = new Map(locations.map(l => [l.id, l.name]));
  const locationBreakdown: Record<number | string, {
    locationId: number | null; locationName: string;
    count: number; totalUsd: number; totalPkr: number;
    coinsPkr: number; cashPkr: number; creditPkr: number; coinsQty: number;
  }> = {};

  for (const p of purchases) {
    const key = p.locationId ?? 0;
    if (!locationBreakdown[key]) {
      locationBreakdown[key] = {
        locationId:   p.locationId,
        locationName: p.locationId ? (locMap.get(p.locationId) ?? `App #${p.locationId}`) : "Unassigned",
        count: 0, totalUsd: 0, totalPkr: 0, coinsPkr: 0, cashPkr: 0, creditPkr: 0, coinsQty: 0,
      };
    }
    const loc = locationBreakdown[key]!;
    loc.count      += 1;
    loc.totalUsd   += parseFloat(p.dollarAmount);
    loc.totalPkr   += parseFloat(p.totalPkr);
    loc.coinsPkr   += parseFloat(p.coinsPkr);
    loc.cashPkr    += parseFloat(p.cashPkr);
    loc.creditPkr  += parseFloat(p.creditPkr);
    loc.coinsQty   += parseFloat(p.coinsQty ?? "0");
  }

  /* ── Product-wise coins breakdown ── */
  const coinsMap: Record<string, { productName: string; qty: number; pkrValue: number; count: number }> = {};
  for (const p of purchases.filter(r => parseFloat(r.coinsPkr) > 0)) {
    const key = p.coinsProductName ?? "Unknown";
    if (!coinsMap[key]) coinsMap[key] = { productName: key, qty: 0, pkrValue: 0, count: 0 };
    coinsMap[key]!.qty      += parseFloat(p.coinsQty ?? "0");
    coinsMap[key]!.pkrValue += parseFloat(p.coinsPkr);
    coinsMap[key]!.count    += 1;
  }

  /* ── Wallet-wise ledger sums ── */
  const walletLedgerMap: Record<number, { walletId: number; totalIn: number; totalOut: number }> = {};
  for (const e of ledger) {
    if (e.walletId == null) continue;
    if (!walletLedgerMap[e.walletId]) walletLedgerMap[e.walletId] = { walletId: e.walletId, totalIn: 0, totalOut: 0 };
    if (IN_TYPES.has(e.entryType))  walletLedgerMap[e.walletId]!.totalIn  += parseFloat(e.amountUsd);
    if (OUT_TYPES.has(e.entryType)) walletLedgerMap[e.walletId]!.totalOut += parseFloat(e.amountUsd);
  }

  const walletsWithStats = wallets.map(w => ({
    id: w.id, name: w.name, type: w.type,
    balance: parseFloat(w.balance),
    ...( walletLedgerMap[w.id] ?? { totalIn: 0, totalOut: 0 } ),
  }));

  res.json({
    period: { from: fromStr, to: toStr },
    summary: {
      totalPurchasedUsd: parseFloat(totPurchUsd.toFixed(4)),
      totalPurchasedPkr: parseFloat(totPurchPkr.toFixed(2)),
      totalCoinsPkr:     parseFloat(totCoinsPkr.toFixed(2)),
      totalCashPkr:      parseFloat(totCashPkr.toFixed(2)),
      totalCreditPkr:    parseFloat(totCreditPkr.toFixed(2)),
      totalCoinsQty:     parseFloat(totCoinsQty.toFixed(4)),
      purchaseCount:     purchases.length,
      ledgerIn:          parseFloat(totLedgerIn.toFixed(4)),
      ledgerOut:         parseFloat(totLedgerOut.toFixed(4)),
      walletBalanceUsd:  parseFloat(walletBalUsd.toFixed(4)),
    },
    wallets: walletsWithStats,
    purchases: purchases.map(p => ({
      id: p.id,
      date: p.date,
      createdAt: p.createdAt.toISOString(),
      customerName: p.customerName,
      customerId: p.customerId,
      dollarAmount: parseFloat(p.dollarAmount),
      dollarRate: parseFloat(p.dollarRate),
      totalPkr: parseFloat(p.totalPkr),
      coinsPkr: parseFloat(p.coinsPkr),
      cashPkr: parseFloat(p.cashPkr),
      creditPkr: parseFloat(p.creditPkr),
      coinsProductName: p.coinsProductName,
      coinsQty: parseFloat(p.coinsQty ?? "0"),
      cashAccountName: p.cashAccountName,
      locationId: p.locationId,
      locationName: p.locationId ? (locMap.get(p.locationId) ?? `App #${p.locationId}`) : null,
      notes: p.notes,
    })),
    ledger: ledger.map(e => ({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt.toISOString(),
      entryType: e.entryType,
      amountUsd: parseFloat(e.amountUsd),
      rate: parseFloat(e.rate),
      totalPkr: parseFloat(e.totalPkr),
      partyName: e.partyName,
      partyType: e.partyType,
      walletId: e.walletId,
      walletName: e.walletId ? (walletsWithStats.find(w => w.id === e.walletId)?.name ?? null) : null,
      notes: e.notes,
      direction: IN_TYPES.has(e.entryType) ? "in" : "out",
    })),
    locationBreakdown: Object.values(locationBreakdown).sort((a, b) => b.totalUsd - a.totalUsd),
    coinsBreakdown: Object.values(coinsMap).sort((a, b) => b.pkrValue - a.pkrValue),
  });
});

export default router;
