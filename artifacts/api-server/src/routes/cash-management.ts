import { Router } from "express";
import { and, eq, gte, lte, inArray, isNotNull } from "drizzle-orm";
import {
  db, accountsTable, salesTable, saleItemsTable, purchasesTable,
  expensesTable, creditPaymentsTable, usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";
import { tenantWhere, ownsRow } from "../lib/tenant.js";

const router = Router();

/* ── GET /cash-management/statement ───────────────────────────────────────
   Query params:
     accountId   (required)  – which account to show
     from        (optional)  – ISO date string YYYY-MM-DD start (inclusive)
     to          (optional)  – ISO date string YYYY-MM-DD end   (inclusive)
     direction   (optional)  – all | in | out   (default: all)
────────────────────────────────────────────────────────────────────────── */
router.get("/cash-management/statement", requireAuth, async (req, res): Promise<void> => {
  const accountId = parseInt(String(req.query["accountId"] ?? ""), 10);
  if (isNaN(accountId)) { res.status(400).json({ error: "accountId required" }); return; }

  const fromStr = req.query["from"] as string | undefined;
  const toStr   = req.query["to"]   as string | undefined;
  const dir     = (req.query["direction"] as string | undefined) ?? "all";

  const fromDate = fromStr ? new Date(fromStr + "T00:00:00Z") : null;
  const toDate   = toStr   ? new Date(toStr   + "T23:59:59Z") : null;

  /* Optional userId / productId (app) filters */
  const userIdRaw    = req.query["userId"];
  const productIdRaw = req.query["productId"];
  const filterUserId    = userIdRaw    && !isNaN(parseInt(String(userIdRaw),    10)) ? parseInt(String(userIdRaw),    10) : null;
  const filterProductId = productIdRaw && !isNaN(parseInt(String(productIdRaw), 10)) ? parseInt(String(productIdRaw), 10) : null;

  /* ── Fetch account info ── */
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  /* tenant ownership check */
  if (!ownsRow(req, account.businessId)) { res.status(403).json({ error: "Forbidden" }); return; }

  /* non-admin can only see accounts in their location */
  if (!isAdmin(req) && req.userLocationId != null && account.locationId != null
      && account.locationId !== req.userLocationId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  /* ── Build date filter helper ── */
  const dateFilters = (col: Parameters<typeof gte>[0]) => {
    const parts = [];
    if (fromDate) parts.push(gte(col, fromDate));
    if (toDate)   parts.push(lte(col, toDate));
    return parts;
  };

  const userFilter = (col: Parameters<typeof eq>[0]) =>
    filterUserId != null ? [eq(col, filterUserId)] : [];

  /* When an "App" (product) filter is active we restrict to entry-source rows
     that are tied to that product. Sales link via saleItems; credit_payments
     have a direct productId column. Purchases/expenses have no product
     concept, so they are excluded when the filter is on. */
  const salesProductFilter = filterProductId != null
    ? [inArray(
        salesTable.id,
        db.select({ id: saleItemsTable.saleId })
          .from(saleItemsTable)
          .where(eq(saleItemsTable.productId, filterProductId))
      )]
    : [];

  /* ── Sales → money IN ── */
  const salesRows = await db.select({
    id: salesTable.id,
    invoiceNo: salesTable.invoiceNo,
    amountPaid: salesTable.amountPaid,
    paymentMethod: salesTable.paymentMethod,
    notes: salesTable.notes,
    userId: salesTable.userId,
    createdAt: salesTable.createdAt,
  }).from(salesTable).where(
    and(
      eq(salesTable.accountId, accountId),
      tenantWhere(req, salesTable.businessId),
      ...dateFilters(salesTable.createdAt),
      ...userFilter(salesTable.userId),
      ...salesProductFilter,
    )
  );

  /* ── Purchases → money OUT (skipped when product filter is on) ── */
  const purchaseRows = filterProductId != null ? [] : await db.select({
    id: purchasesTable.id,
    invoiceNo: purchasesTable.invoiceNo,
    amountPaid: purchasesTable.amountPaid,
    notes: purchasesTable.notes,
    userId: purchasesTable.userId,
    createdAt: purchasesTable.createdAt,
  }).from(purchasesTable).where(
    and(
      eq(purchasesTable.accountId, accountId),
      tenantWhere(req, purchasesTable.businessId),
      ...dateFilters(purchasesTable.createdAt),
      ...userFilter(purchasesTable.userId),
    )
  );

  /* ── Expenses → money OUT (skipped when product filter is on) ── */
  const expenseRows = filterProductId != null ? [] : await db.select({
    id: expensesTable.id,
    title: expensesTable.title,
    amount: expensesTable.amount,
    notes: expensesTable.notes,
    userId: expensesTable.userId,
    createdAt: expensesTable.createdAt,
  }).from(expensesTable).where(
    and(
      eq(expensesTable.accountId, accountId),
      tenantWhere(req, expensesTable.businessId),
      ...dateFilters(expensesTable.createdAt),
      ...userFilter(expensesTable.userId),
    )
  );

  /* ── Credit payments → money IN ── */
  const cpProductFilter = filterProductId != null
    ? [eq(creditPaymentsTable.productId, filterProductId)]
    : [];
  const cpRows = await db.select({
    id: creditPaymentsTable.id,
    creditId: creditPaymentsTable.creditId,
    amount: creditPaymentsTable.amount,
    notes: creditPaymentsTable.notes,
    userId: creditPaymentsTable.userId,
    createdAt: creditPaymentsTable.createdAt,
  }).from(creditPaymentsTable).where(
    and(
      eq(creditPaymentsTable.accountId, accountId),
      tenantWhere(req, creditPaymentsTable.businessId),
      ...dateFilters(creditPaymentsTable.createdAt),
      ...userFilter(creditPaymentsTable.userId),
      ...cpProductFilter,
    )
  );

  /* ── Resolve userId → username for entry display ── */
  const userIdSet = new Set<number>();
  salesRows.forEach(r => userIdSet.add(r.userId));
  purchaseRows.forEach(r => userIdSet.add(r.userId));
  expenseRows.forEach(r => userIdSet.add(r.userId));
  cpRows.forEach(r => userIdSet.add(r.userId));
  const userMap = new Map<number, { username: string; name: string | null }>();
  if (userIdSet.size > 0) {
    const users = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      name: usersTable.name,
    }).from(usersTable).where(
      and(
        inArray(usersTable.id, Array.from(userIdSet)),
        tenantWhere(req, usersTable.businessId),
      )
    );
    users.forEach(u => userMap.set(u.id, { username: u.username, name: u.name ?? null }));
  }
  const labelFor = (uid: number) => {
    const u = userMap.get(uid);
    if (!u) return `#${uid}`;
    return u.name && u.name.trim() ? u.name : u.username;
  };

  /* ── Merge all into a flat entry list ── */
  type Entry = {
    id: string; date: string; description: string;
    credit: number; debit: number; kind: string;
    notes: string | null;
    userId: number; userName: string;
  };

  const entries: Entry[] = [
    ...salesRows.map(r => ({
      id: `sale-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Sale ${r.invoiceNo}${r.paymentMethod !== "cash" ? ` · ${r.paymentMethod}` : ""}`,
      credit: parseFloat(r.amountPaid),
      debit: 0,
      kind: "sale",
      notes: r.notes ?? null,
      userId: r.userId, userName: labelFor(r.userId),
    })),
    ...purchaseRows.map(r => ({
      id: `purchase-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Purchase ${r.invoiceNo}`,
      credit: 0,
      debit: parseFloat(r.amountPaid),
      kind: "purchase",
      notes: r.notes ?? null,
      userId: r.userId, userName: labelFor(r.userId),
    })),
    ...expenseRows.map(r => ({
      id: `expense-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Expense: ${r.title}`,
      credit: 0,
      debit: parseFloat(r.amount),
      kind: "expense",
      notes: r.notes ?? null,
      userId: r.userId, userName: labelFor(r.userId),
    })),
    ...cpRows.map(r => ({
      id: `cpayment-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Credit Payment #${r.creditId}`,
      credit: parseFloat(r.amount),
      debit: 0,
      kind: "credit_payment",
      notes: r.notes ?? null,
      userId: r.userId, userName: labelFor(r.userId),
    })),
  ];

  /* ── Sort chronologically ── */
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  /* ── Apply direction filter ── */
  const filtered = dir === "in"
    ? entries.filter(e => e.credit > 0)
    : dir === "out"
      ? entries.filter(e => e.debit > 0)
      : entries;

  /* ── Compute opening balance = current balance − period net ── */
  const periodNet = entries.reduce((sum, e) => sum + e.credit - e.debit, 0);
  const currentBalance = parseFloat(account.balance);
  const openingBalance = currentBalance - periodNet;

  /* ── Add running balance to each row ── */
  let running = openingBalance;
  const withBalance = filtered.map(e => {
    running += e.credit - e.debit;
    return { ...e, balance: parseFloat(running.toFixed(2)) };
  });

  /* ── Compute summary ── */
  const totalIn  = entries.reduce((s, e) => s + e.credit, 0);
  const totalOut = entries.reduce((s, e) => s + e.debit,  0);

  res.json({
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: currentBalance,
      currency: account.currency,
    },
    summary: {
      openingBalance: parseFloat(openingBalance.toFixed(2)),
      totalIn:        parseFloat(totalIn.toFixed(2)),
      totalOut:       parseFloat(totalOut.toFixed(2)),
      closingBalance: parseFloat(currentBalance.toFixed(2)),
      entryCount:     filtered.length,
    },
    entries: withBalance,
  });
});

/* ── GET /cash-management/accounts ────────────────────────────────────── */
router.get("/cash-management/accounts", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, accountsTable.businessId);
  const rows = isAdmin(req) || req.userLocationId == null
    ? await db.select().from(accountsTable).where(and(eq(accountsTable.isActive, true), tenant))
    : await db.select().from(accountsTable).where(
        and(eq(accountsTable.isActive, true), eq(accountsTable.locationId, req.userLocationId), tenant)
      );
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    balance: parseFloat(r.balance),
    currency: r.currency,
    locationId: r.locationId,
  })));
});

export default router;
