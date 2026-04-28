import { Router } from "express";
import { desc, eq, gte, and, lt, or, inArray } from "drizzle-orm";
import {
  db,
  salesTable,
  purchasesTable,
  purchaseItemsTable,
  expensesTable,
  creditsTable,
  customersTable,
  productsTable,
  suppliersTable,
  accountsTable,
  stockTransfersTable,
  dollarWalletTable,
  locationsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

function getPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === "yesterday") {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end: now };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const period = typeof req.query.period === "string" ? req.query.period : "today";

  // Role-based scoping: non-admin users are HARD-SCOPED to their own data.
  // Admin/manager can use the optional ?userId / ?locationId query params to
  // drill down. Cashier (or any non-admin role) is forced to their own userId
  // and their assigned locationId regardless of what they pass.
  const isAdmin = req.userRole === "admin" || req.userRole === "manager";
  const queryUserId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : null;
  const queryLocationId = typeof req.query.locationId === "string" ? parseInt(req.query.locationId) : null;
  const filterUserId = isAdmin ? queryUserId : (req.userId ?? null);
  const filterLocationId = isAdmin ? queryLocationId : (req.userLocationId ?? null);

  const { start, end } = getPeriodRange(period);
  const isYesterday = period === "yesterday";

  const periodFilter = (col: Parameters<typeof gte>[0]) =>
    isYesterday ? and(gte(col, start), lt(col, end)) : gte(col, start);

  // Build sales filter: period + optional userId + optional locationId
  const salesPeriodFilter = filterUserId && filterLocationId
    ? and(periodFilter(salesTable.createdAt), eq(salesTable.userId, filterUserId), eq(salesTable.locationId, filterLocationId))
    : filterUserId
      ? and(periodFilter(salesTable.createdAt), eq(salesTable.userId, filterUserId))
      : filterLocationId
        ? and(periodFilter(salesTable.createdAt), eq(salesTable.locationId, filterLocationId))
        : periodFilter(salesTable.createdAt);

  // Helper: combine periodFilter with optional userId/locationId scoping
  const scopedPeriodFilter = (
    col: Parameters<typeof gte>[0],
    userIdCol?: Parameters<typeof eq>[0],
    locationIdCol?: Parameters<typeof eq>[0],
  ) => {
    const parts: Parameters<typeof and>[number][] = [periodFilter(col)];
    if (filterUserId && userIdCol) parts.push(eq(userIdCol, filterUserId));
    if (filterLocationId && locationIdCol) parts.push(eq(locationIdCol, filterLocationId));
    return parts.length === 1 ? parts[0] : and(...parts);
  };

  // Credits filter by userId
  const creditUserFilter = filterUserId ? eq(creditsTable.userId, filterUserId) : undefined;

  // Build product scope (active + optional location filter for non-admin)
  const productScope = filterLocationId
    ? and(eq(productsTable.isActive, true), eq(productsTable.locationId, filterLocationId))
    : eq(productsTable.isActive, true);

  // Account scope (location filter when present)
  const accountScope = filterLocationId
    ? and(eq(accountsTable.isActive, true), eq(accountsTable.locationId, filterLocationId))
    : eq(accountsTable.isActive, true);

  const [
    periodSalesRows, periodPurchasesRows, periodExpensesRows,
    customersCount, productsCount, suppliersCount,
    creditReceivableRows, creditPayableRows,
    productsWithLoc, accounts, recentSales,
    periodPurchaseIds, periodStockTransfers, periodDollarReceived,
    locations,
  ] = await Promise.all([
    db.select({ total: salesTable.total }).from(salesTable).where(salesPeriodFilter),
    db.select({ total: purchasesTable.total }).from(purchasesTable)
      .where(scopedPeriodFilter(purchasesTable.createdAt, purchasesTable.userId, purchasesTable.locationId)),
    db.select({ amount: expensesTable.amount }).from(expensesTable)
      .where(scopedPeriodFilter(expensesTable.createdAt, expensesTable.userId)),
    db.select({ id: customersTable.id }).from(customersTable),
    db.select({ id: productsTable.id }).from(productsTable),
    db.select({ id: suppliersTable.id }).from(suppliersTable),
    db.select({ remaining: creditsTable.remainingAmount })
      .from(creditsTable)
      .where(and(
        eq(creditsTable.type, "receivable"),
        or(eq(creditsTable.status, "pending"), eq(creditsTable.status, "partial")),
        creditUserFilter,
      )),
    db.select({ remaining: creditsTable.remainingAmount })
      .from(creditsTable)
      .where(and(
        eq(creditsTable.type, "payable"),
        or(eq(creditsTable.status, "pending"), eq(creditsTable.status, "partial")),
        creditUserFilter,
      )),
    // Products with locationId for per-location breakdown
    db.select({
      stock: productsTable.stock,
      unitPrice: productsTable.unitPrice,
      locationId: productsTable.locationId,
    }).from(productsTable).where(productScope),
    db.select().from(accountsTable).where(accountScope),
    db.select().from(salesTable)
      .where(period === "today" || isYesterday ? salesPeriodFilter : undefined)
      .orderBy(desc(salesTable.createdAt))
      .limit(10),
    // Period purchase IDs to aggregate received stock qty
    db.select({ id: purchasesTable.id }).from(purchasesTable)
      .where(scopedPeriodFilter(purchasesTable.createdAt, purchasesTable.userId, purchasesTable.locationId)),
    // Stock transfers for the period (with product price for value)
    db.select({
      qty: stockTransfersTable.qty,
      unitPrice: productsTable.unitPrice,
      fromLocationId: stockTransfersTable.fromLocationId,
      userId: stockTransfersTable.userId,
    })
      .from(stockTransfersTable)
      .leftJoin(productsTable, eq(stockTransfersTable.fromProductId, productsTable.id))
      .where(scopedPeriodFilter(
        stockTransfersTable.createdAt,
        stockTransfersTable.userId,
        stockTransfersTable.fromLocationId,
      )),
    // Dollar wallet "received" entries for the period
    db.select({ amountUsd: dollarWalletTable.amountUsd, totalPkr: dollarWalletTable.totalPkr, rate: dollarWalletTable.rate })
      .from(dollarWalletTable)
      .where(and(eq(dollarWalletTable.entryType, "received"), periodFilter(dollarWalletTable.createdAt))),
    // All locations for per-location naming
    db.select().from(locationsTable).where(eq(locationsTable.isActive, true)),
  ]);

  // Received stock qty: sum of all purchase_items.qty for purchases in this period
  const purchaseIds = periodPurchaseIds.map(p => p.id);
  const receivedStockItems = purchaseIds.length > 0
    ? await db.select({ qty: purchaseItemsTable.qty, total: purchaseItemsTable.total })
        .from(purchaseItemsTable)
        .where(inArray(purchaseItemsTable.purchaseId, purchaseIds))
    : [];
  const receivedStockQty = receivedStockItems.reduce((sum, r) => sum + r.qty, 0);
  const receivedStockValue = receivedStockItems.reduce((sum, r) => sum + parseFloat(r.total), 0);

  // Stock transferred to other locations
  const stockTransferredQty = periodStockTransfers.reduce((sum, r) => sum + r.qty, 0);
  const stockTransferredValue = periodStockTransfers.reduce(
    (sum, r) => sum + r.qty * parseFloat(r.unitPrice ?? "0"),
    0,
  );

  // Dollar received -> exchanged to PKR
  const dollarReceivedUsd = periodDollarReceived.reduce((sum, r) => sum + parseFloat(r.amountUsd), 0);
  const dollarExchangedPkr = periodDollarReceived.reduce((sum, r) => sum + parseFloat(r.totalPkr), 0);
  const dollarAvgRate = dollarReceivedUsd > 0 ? dollarExchangedPkr / dollarReceivedUsd : 0;

  // Total product qty (sum of stock units across all active products in scope)
  const totalProductsQty = productsWithLoc.reduce((sum, p) => sum + p.stock, 0);

  const periodSales = periodSalesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodPurchases = periodPurchasesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodExpenses = periodExpensesRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const creditReceivable = creditReceivableRows.reduce((sum, r) => sum + parseFloat(r.remaining), 0);
  const creditPayable = creditPayableRows.reduce((sum, r) => sum + parseFloat(r.remaining), 0);
  const totalStockValue = productsWithLoc.reduce((sum, p) => sum + p.stock * parseFloat(p.unitPrice), 0);
  const totalAccountsBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);

  // ===== Per-location inventory breakdown =====
  // Group products by locationId; products with null locationId go into "Unassigned".
  const locNameById = new Map(locations.map(l => [l.id, l.name]));
  const invByLoc = new Map<number | null, { qty: number; value: number; productCount: number }>();
  for (const p of productsWithLoc) {
    const key = p.locationId ?? null;
    const cur = invByLoc.get(key) ?? { qty: 0, value: 0, productCount: 0 };
    cur.qty += p.stock;
    cur.value += p.stock * parseFloat(p.unitPrice);
    cur.productCount += 1;
    invByLoc.set(key, cur);
  }
  const inventoryByLocation = Array.from(invByLoc.entries()).map(([locId, agg]) => ({
    locationId: locId,
    locationName: locId == null ? "Unassigned" : (locNameById.get(locId) ?? `Location #${locId}`),
    qty: agg.qty,
    value: agg.value.toFixed(8),
    productCount: agg.productCount,
  })).sort((a, b) => b.qty - a.qty);

  // ===== Totals breakdown: Cash / Stock / Credit / Other / Total =====
  // - cash:   sum of accounts where type === "cash"
  // - other:  sum of accounts where type !== "cash" (bank, mobile_wallet, etc.)
  // - stock:  totalStockValue (already computed above)
  // - credit: net = receivable - payable
  // - total:  cash + other + stock + credit
  const cashTotal = accounts
    .filter(a => (a.type ?? "cash") === "cash")
    .reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const otherTotal = accounts
    .filter(a => (a.type ?? "cash") !== "cash")
    .reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const creditNet = creditReceivable - creditPayable;
  const grandTotal = cashTotal + otherTotal + totalStockValue + creditNet;

  const totalsBreakdown = {
    cash: cashTotal.toFixed(8),
    stock: totalStockValue.toFixed(8),
    credit: creditNet.toFixed(8),
    creditReceivable: creditReceivable.toFixed(8),
    creditPayable: creditPayable.toFixed(8),
    other: otherTotal.toFixed(8),
    total: grandTotal.toFixed(8),
  };

  res.json({
    period,
    todaySales: periodSales.toFixed(8),
    todaySalesCount: periodSalesRows.length,
    todayPurchases: periodPurchases.toFixed(8),
    todayExpenses: periodExpenses.toFixed(8),
    totalCustomers: customersCount.length,
    totalProducts: productsCount.length,
    totalSuppliers: suppliersCount.length,
    creditReceivable: creditReceivable.toFixed(8),
    creditReceivableCount: creditReceivableRows.length,
    creditPayable: creditPayable.toFixed(8),
    creditPayableCount: creditPayableRows.length,
    pendingCredits: (creditReceivable + creditPayable).toFixed(8),
    pendingCreditsCount: creditReceivableRows.length + creditPayableRows.length,
    totalStockValue: totalStockValue.toFixed(8),
    totalAccountsBalance: totalAccountsBalance.toFixed(8),
    // New metrics
    totalProductsQty,
    receivedStockQty,
    receivedStockValue: receivedStockValue.toFixed(8),
    receivedStockCount: periodPurchaseIds.length,
    cashTransferredToCompany: periodExpenses.toFixed(8),
    cashTransferredCount: periodExpensesRows.length,
    stockTransferredQty,
    stockTransferredValue: stockTransferredValue.toFixed(8),
    stockTransferredCount: periodStockTransfers.length,
    dollarReceivedUsd: dollarReceivedUsd.toFixed(8),
    dollarExchangedPkr: dollarExchangedPkr.toFixed(8),
    dollarAvgRate: dollarAvgRate.toFixed(4),
    dollarReceivedCount: periodDollarReceived.length,
    // Inventory & wealth breakdowns
    inventoryByLocation,
    totalsBreakdown,
    // Scope info so the UI can show "viewing your data" vs "viewing all"
    scope: {
      isAdmin,
      userId: filterUserId,
      locationId: filterLocationId,
      role: req.userRole ?? null,
    },
    recentSales: recentSales.map(s => ({
      ...s, items: [], customerName: null, locationName: null, accountName: null,
      createdAt: s.createdAt.toISOString(),
    })),
    accountBalances: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
});

export default router;
