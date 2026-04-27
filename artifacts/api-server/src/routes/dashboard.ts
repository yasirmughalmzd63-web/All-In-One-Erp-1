import { Router } from "express";
import { desc, eq, gte, and, lt, or } from "drizzle-orm";
import { db, salesTable, purchasesTable, expensesTable, creditsTable, customersTable, productsTable, suppliersTable, accountsTable } from "@workspace/db";
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
  const { start, end } = getPeriodRange(period);
  const isYesterday = period === "yesterday";

  const periodFilter = (col: Parameters<typeof gte>[0]) =>
    isYesterday ? and(gte(col, start), lt(col, end)) : gte(col, start);

  const [
    periodSalesRows, periodPurchasesRows, periodExpensesRows,
    customersCount, productsCount, suppliersCount,
    creditReceivableRows, creditPayableRows,
    stockProducts, accounts, recentSales,
  ] = await Promise.all([
    db.select({ total: salesTable.total }).from(salesTable).where(periodFilter(salesTable.createdAt)),
    db.select({ total: purchasesTable.total }).from(purchasesTable).where(periodFilter(purchasesTable.createdAt)),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(periodFilter(expensesTable.createdAt)),
    db.select({ id: customersTable.id }).from(customersTable),
    db.select({ id: productsTable.id }).from(productsTable),
    db.select({ id: suppliersTable.id }).from(suppliersTable),
    db.select({ remaining: creditsTable.remainingAmount })
      .from(creditsTable)
      .where(and(eq(creditsTable.type, "receivable"), or(eq(creditsTable.status, "pending"), eq(creditsTable.status, "partial")))),
    db.select({ remaining: creditsTable.remainingAmount })
      .from(creditsTable)
      .where(and(eq(creditsTable.type, "payable"), or(eq(creditsTable.status, "pending"), eq(creditsTable.status, "partial")))),
    db.select({ stock: productsTable.stock, unitPrice: productsTable.unitPrice })
      .from(productsTable)
      .where(eq(productsTable.isActive, true)),
    db.select().from(accountsTable),
    db.select().from(salesTable)
      .where(period === "today" || isYesterday ? periodFilter(salesTable.createdAt) : undefined)
      .orderBy(desc(salesTable.createdAt))
      .limit(10),
  ]);

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
    recentSales: recentSales.map(s => ({
      ...s, items: [], customerName: null, locationName: null, accountName: null,
      createdAt: s.createdAt.toISOString(),
    })),
    accountBalances: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
});

export default router;
