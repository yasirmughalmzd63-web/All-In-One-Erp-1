import { Router } from "express";
import { desc, eq, gte, and, lt, lte, gt, or, inArray, sql } from "drizzle-orm";
import {
  db,
  salesTable,
  saleItemsTable,
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
  walletsTable,
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
    usdWallets, lastReceivedRateRow,
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
    // ALL USD wallets (currency = USD) — to value USD inventory at sale price
    db.select({ id: walletsTable.id, name: walletsTable.name, balance: walletsTable.balance, currency: walletsTable.currency })
      .from(walletsTable)
      .where(and(eq(walletsTable.isActive, true), eq(walletsTable.currency, "USD"))),
    // Most recent "received" entry — its rate is the current SALE rate of USD
    db.select({ rate: dollarWalletTable.rate, date: dollarWalletTable.date, createdAt: dollarWalletTable.createdAt })
      .from(dollarWalletTable)
      .where(eq(dollarWalletTable.entryType, "received"))
      .orderBy(desc(dollarWalletTable.createdAt))
      .limit(1),
  ]);

  // ── USD inventory valued at SALE PRICE ──────────────────────────────────
  // Sale price = most recent "received" rate (the rate at which we last sold
  // USD to a customer). Falls back to 0 when there has never been a sale.
  const currentDollarSaleRate = lastReceivedRateRow.length > 0
    ? parseFloat(lastReceivedRateRow[0]!.rate)
    : 0;
  const dollarWalletBalanceUsd = usdWallets.reduce(
    (sum, w) => sum + parseFloat(w.balance ?? "0"), 0,
  );
  const dollarWalletValuePkr = dollarWalletBalanceUsd * currentDollarSaleRate;

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

  // USD wallet inventory value (at sale price) is part of total wealth
  const grandTotalWithUsd = grandTotal + dollarWalletValuePkr;

  const totalsBreakdown = {
    cash: cashTotal.toFixed(8),
    stock: totalStockValue.toFixed(8),
    credit: creditNet.toFixed(8),
    creditReceivable: creditReceivable.toFixed(8),
    creditPayable: creditPayable.toFixed(8),
    other: otherTotal.toFixed(8),
    // USD inventory valued at the most recent SALE rate (not cost rate)
    dollarInventoryUsd: dollarWalletBalanceUsd.toFixed(8),
    dollarInventoryPkr: dollarWalletValuePkr.toFixed(8),
    dollarSaleRate: currentDollarSaleRate.toFixed(4),
    total: grandTotalWithUsd.toFixed(8),
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

// ─────────────────────────────────────────────────────────────────────────────
// Inventory Ledger — Opening / Received / Sold / Balance per product over a
// date range. Role-scoped: cashier sees own location only.
//
// Query params (all optional):
//   startDate=YYYY-MM-DD  endDate=YYYY-MM-DD  locationId=N  productId=N
// Defaults: when BOTH dates are absent => all-time. When one is provided,
// the other defaults to today's bound (start-of-today / end-of-today).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/inventory/ledger", requireAuth, async (req, res): Promise<void> => {
  const startStr = typeof req.query.startDate === "string" ? req.query.startDate : null;
  const endStr   = typeof req.query.endDate   === "string" ? req.query.endDate   : null;
  const queryLocId  = typeof req.query.locationId === "string" ? parseInt(req.query.locationId) : null;
  const queryProdId = typeof req.query.productId  === "string" ? parseInt(req.query.productId)  : null;

  const isAdmin = req.userRole === "admin" || req.userRole === "manager";

  // Strict scoping for non-admins: must have an assigned location, otherwise
  // refuse to leak cross-location data.
  if (!isAdmin && (req.userLocationId === null || req.userLocationId === undefined)) {
    res.status(403).json({ error: "User has no assigned app/location; ledger access denied." });
    return;
  }
  const filterLocationId = isAdmin ? queryLocId : (req.userLocationId ?? null);

  // Date range
  // - both absent  => all-time (epoch .. far-future)
  // - one present  => other defaults to today's matching bound
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  let start: Date;
  let end:   Date;
  if (!startStr && !endStr) {
    start = new Date(0);
    end   = new Date(now.getFullYear() + 100, 0, 1);
  } else {
    start = startStr ? new Date(`${startStr}T00:00:00.000`) : todayStart;
    end   = endStr   ? new Date(`${endStr}T23:59:59.999`)   : todayEnd;
  }

  // Products in scope
  const productConds = [eq(productsTable.isActive, true)];
  if (filterLocationId) productConds.push(eq(productsTable.locationId, filterLocationId));
  if (queryProdId)      productConds.push(eq(productsTable.id, queryProdId));

  const products = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    sku: productsTable.sku,
    stock: productsTable.stock,
    unitPrice: productsTable.unitPrice,
    costPrice: productsTable.costPrice,
    locationId: productsTable.locationId,
  }).from(productsTable).where(and(...productConds));
  const productIds = products.map(p => p.id);

  // Locations (for naming)
  const locations = await db.select({ id: locationsTable.id, name: locationsTable.name })
    .from(locationsTable);
  const locNameById = new Map(locations.map(l => [l.id, l.name]));

  // Aggregations: in-range and after-end-date
  // Sales in range
  const salesInRange = productIds.length === 0 ? [] : await db.select({
    productId: saleItemsTable.productId,
    qty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
    value: sql<string>`coalesce(sum(cast(${saleItemsTable.total} as numeric)), 0)`,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(
      inArray(saleItemsTable.productId, productIds),
      gte(salesTable.createdAt, start),
      lte(salesTable.createdAt, end),
    ))
    .groupBy(saleItemsTable.productId);

  // Purchases in range
  const purchasesInRange = productIds.length === 0 ? [] : await db.select({
    productId: purchaseItemsTable.productId,
    qty: sql<string>`coalesce(sum(${purchaseItemsTable.qty}), 0)`,
    value: sql<string>`coalesce(sum(cast(${purchaseItemsTable.total} as numeric)), 0)`,
  }).from(purchaseItemsTable)
    .innerJoin(purchasesTable, eq(purchaseItemsTable.purchaseId, purchasesTable.id))
    .where(and(
      inArray(purchaseItemsTable.productId, productIds),
      gte(purchasesTable.createdAt, start),
      lte(purchasesTable.createdAt, end),
    ))
    .groupBy(purchaseItemsTable.productId);

  // Sales AFTER end (to walk current stock back to balance@end)
  const salesAfterEnd = productIds.length === 0 ? [] : await db.select({
    productId: saleItemsTable.productId,
    qty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(
      inArray(saleItemsTable.productId, productIds),
      gt(salesTable.createdAt, end),
    ))
    .groupBy(saleItemsTable.productId);

  // Purchases AFTER end
  const purchasesAfterEnd = productIds.length === 0 ? [] : await db.select({
    productId: purchaseItemsTable.productId,
    qty: sql<string>`coalesce(sum(${purchaseItemsTable.qty}), 0)`,
  }).from(purchaseItemsTable)
    .innerJoin(purchasesTable, eq(purchaseItemsTable.purchaseId, purchasesTable.id))
    .where(and(
      inArray(purchaseItemsTable.productId, productIds),
      gt(purchasesTable.createdAt, end),
    ))
    .groupBy(purchaseItemsTable.productId);

  const salesInMap        = new Map(salesInRange.map(r => [r.productId, { qty: parseInt(r.qty), value: parseFloat(r.value) }]));
  const purchasesInMap    = new Map(purchasesInRange.map(r => [r.productId, { qty: parseInt(r.qty), value: parseFloat(r.value) }]));
  const salesAfterMap     = new Map(salesAfterEnd.map(r => [r.productId, parseInt(r.qty)]));
  const purchasesAfterMap = new Map(purchasesAfterEnd.map(r => [r.productId, parseInt(r.qty)]));

  // Build rows
  const rows = products.map(p => {
    const recv  = purchasesInMap.get(p.id)    ?? { qty: 0, value: 0 };
    const sold  = salesInMap.get(p.id)        ?? { qty: 0, value: 0 };
    const recAf = purchasesAfterMap.get(p.id) ?? 0;
    const solAf = salesAfterMap.get(p.id)     ?? 0;

    // balanceAtEnd = currentStock - purchasesAfterEnd + salesAfterEnd
    const balanceAtEnd = (p.stock ?? 0) - recAf + solAf;
    const opening      = balanceAtEnd - recv.qty + sold.qty;

    const unitPrice = parseFloat(p.unitPrice ?? "0");
    const costPrice = parseFloat(p.costPrice ?? "0");
    const stockValueAtCost  = balanceAtEnd * costPrice;
    const stockValueAtPrice = balanceAtEnd * unitPrice;

    return {
      productId:    p.id,
      productName:  p.name,
      sku:          p.sku,
      locationId:   p.locationId,
      locationName: p.locationId ? (locNameById.get(p.locationId) ?? null) : null,
      currentStock: p.stock ?? 0,
      opening,
      received:        recv.qty,
      receivedValue:   recv.value.toFixed(8),
      sold:            sold.qty,
      soldValue:       sold.value.toFixed(8),
      balance:         balanceAtEnd,
      unitPrice:       unitPrice.toFixed(8),
      costPrice:       costPrice.toFixed(8),
      stockValueAtCost:  stockValueAtCost.toFixed(8),
      stockValueAtPrice: stockValueAtPrice.toFixed(8),
    };
  });

  // Totals
  const totals = rows.reduce((acc, r) => ({
    opening:           acc.opening  + r.opening,
    received:          acc.received + r.received,
    receivedValue:     acc.receivedValue + parseFloat(r.receivedValue),
    sold:              acc.sold + r.sold,
    soldValue:         acc.soldValue + parseFloat(r.soldValue),
    balance:           acc.balance + r.balance,
    stockValueAtCost:  acc.stockValueAtCost  + parseFloat(r.stockValueAtCost),
    stockValueAtPrice: acc.stockValueAtPrice + parseFloat(r.stockValueAtPrice),
  }), {
    opening: 0, received: 0, receivedValue: 0, sold: 0, soldValue: 0,
    balance: 0, stockValueAtCost: 0, stockValueAtPrice: 0,
  });

  res.json({
    startDate: start.toISOString(),
    endDate:   end.toISOString(),
    scope: {
      isAdmin,
      locationId: filterLocationId,
      role: req.userRole ?? null,
    },
    rows: rows.sort((a, b) => (a.locationName ?? "").localeCompare(b.locationName ?? "") || a.productName.localeCompare(b.productName)),
    totals: {
      opening:           totals.opening,
      received:          totals.received,
      receivedValue:     totals.receivedValue.toFixed(8),
      sold:              totals.sold,
      soldValue:         totals.soldValue.toFixed(8),
      balance:           totals.balance,
      stockValueAtCost:  totals.stockValueAtCost.toFixed(8),
      stockValueAtPrice: totals.stockValueAtPrice.toFixed(8),
    },
  });
});

export default router;
