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
  const filterUserId = typeof req.query.userId === "string" ? parseInt(req.query.userId) : null;
  const filterLocationId = typeof req.query.locationId === "string" ? parseInt(req.query.locationId) : null;

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

  // Credits filter by userId
  const creditUserFilter = filterUserId ? eq(creditsTable.userId, filterUserId) : undefined;

  const [
    periodSalesRows, periodPurchasesRows, periodExpensesRows,
    customersCount, productsCount, suppliersCount,
    creditReceivableRows, creditPayableRows,
    stockProducts, accounts, recentSales,
    periodPurchaseIds, periodStockTransfers, periodDollarReceived,
  ] = await Promise.all([
    db.select({ total: salesTable.total }).from(salesTable).where(salesPeriodFilter),
    db.select({ total: purchasesTable.total }).from(purchasesTable).where(periodFilter(purchasesTable.createdAt)),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(periodFilter(expensesTable.createdAt)),
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
    // Stock filtered by location if provided
    filterLocationId
      ? db.select({ stock: productsTable.stock, unitPrice: productsTable.unitPrice })
          .from(productsTable)
          .where(and(eq(productsTable.isActive, true), eq(productsTable.locationId, filterLocationId)))
      : db.select({ stock: productsTable.stock, unitPrice: productsTable.unitPrice })
          .from(productsTable)
          .where(eq(productsTable.isActive, true)),
    db.select().from(accountsTable),
    db.select().from(salesTable)
      .where(period === "today" || isYesterday ? salesPeriodFilter : undefined)
      .orderBy(desc(salesTable.createdAt))
      .limit(10),
    // Period purchase IDs to aggregate received stock qty
    db.select({ id: purchasesTable.id }).from(purchasesTable).where(periodFilter(purchasesTable.createdAt)),
    // Stock transfers for the period (with product price for value)
    db.select({
      qty: stockTransfersTable.qty,
      unitPrice: productsTable.unitPrice,
      costPrice: productsTable.costPrice,
    })
      .from(stockTransfersTable)
      .leftJoin(productsTable, eq(stockTransfersTable.fromProductId, productsTable.id))
      .where(periodFilter(stockTransfersTable.createdAt)),
    // Dollar wallet "received" entries for the period
    db.select({ amountUsd: dollarWalletTable.amountUsd, totalPkr: dollarWalletTable.totalPkr, rate: dollarWalletTable.rate })
      .from(dollarWalletTable)
      .where(and(eq(dollarWalletTable.entryType, "received"), periodFilter(dollarWalletTable.createdAt))),
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

  // Total product qty (sum of stock units across all active products)
  const totalProductsQty = stockProducts.reduce((sum, p) => sum + p.stock, 0);

  const periodSales = periodSalesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodPurchases = periodPurchasesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodExpenses = periodExpensesRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const creditReceivable = creditReceivableRows.reduce((sum, r) => sum + parseFloat(r.remaining), 0);
  const creditPayable = creditPayableRows.reduce((sum, r) => sum + parseFloat(r.remaining), 0);
  const totalStockValue = stockProducts.reduce((sum, p) => sum + p.stock * parseFloat(p.unitPrice), 0);
  const totalAccountsBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);

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
    recentSales: recentSales.map(s => ({
      ...s, items: [], customerName: null, locationName: null, accountName: null,
      createdAt: s.createdAt.toISOString(),
    })),
    accountBalances: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
});

export default router;
