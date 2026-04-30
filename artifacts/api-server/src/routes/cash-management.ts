import { Router } from "express";
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import {
  db, accountsTable, salesTable, purchasesTable,
  expensesTable, creditPaymentsTable,
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

  /* ── Sales → money IN ── */
  const salesRows = await db.select({
    id: salesTable.id,
    invoiceNo: salesTable.invoiceNo,
    amountPaid: salesTable.amountPaid,
    paymentMethod: salesTable.paymentMethod,
    notes: salesTable.notes,
    createdAt: salesTable.createdAt,
  }).from(salesTable).where(
    and(
      eq(salesTable.accountId, accountId),
      tenantWhere(req, salesTable.businessId),
      ...dateFilters(salesTable.createdAt),
    )
  );

  /* ── Purchases → money OUT ── */
  const purchaseRows = await db.select({
    id: purchasesTable.id,
    invoiceNo: purchasesTable.invoiceNo,
    amountPaid: purchasesTable.amountPaid,
    notes: purchasesTable.notes,
    createdAt: purchasesTable.createdAt,
  }).from(purchasesTable).where(
    and(
      eq(purchasesTable.accountId, accountId),
      tenantWhere(req, purchasesTable.businessId),
      ...dateFilters(purchasesTable.createdAt),
    )
  );

  /* ── Expenses → money OUT ── */
  const expenseRows = await db.select({
    id: expensesTable.id,
    title: expensesTable.title,
    amount: expensesTable.amount,
    notes: expensesTable.notes,
    createdAt: expensesTable.createdAt,
  }).from(expensesTable).where(
    and(
      eq(expensesTable.accountId, accountId),
      tenantWhere(req, expensesTable.businessId),
      ...dateFilters(expensesTable.createdAt),
    )
  );

  /* ── Credit payments → money IN ── */
  const cpRows = await db.select({
    id: creditPaymentsTable.id,
    creditId: creditPaymentsTable.creditId,
    amount: creditPaymentsTable.amount,
    notes: creditPaymentsTable.notes,
    createdAt: creditPaymentsTable.createdAt,
  }).from(creditPaymentsTable).where(
    and(
      eq(creditPaymentsTable.accountId, accountId),
      tenantWhere(req, creditPaymentsTable.businessId),
      ...dateFilters(creditPaymentsTable.createdAt),
    )
  );

  /* ── Merge all into a flat entry list ── */
  type Entry = {
    id: string; date: string; description: string;
    credit: number; debit: number; kind: string;
    notes: string | null;
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
    })),
    ...purchaseRows.map(r => ({
      id: `purchase-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Purchase ${r.invoiceNo}`,
      credit: 0,
      debit: parseFloat(r.amountPaid),
      kind: "purchase",
      notes: r.notes ?? null,
    })),
    ...expenseRows.map(r => ({
      id: `expense-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Expense: ${r.title}`,
      credit: 0,
      debit: parseFloat(r.amount),
      kind: "expense",
      notes: r.notes ?? null,
    })),
    ...cpRows.map(r => ({
      id: `cpayment-${r.id}`,
      date: r.createdAt.toISOString(),
      description: `Credit Payment #${r.creditId}`,
      credit: parseFloat(r.amount),
      debit: 0,
      kind: "credit_payment",
      notes: r.notes ?? null,
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
