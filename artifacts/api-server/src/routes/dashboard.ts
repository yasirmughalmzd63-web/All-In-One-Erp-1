import { Router } from "express";
import { desc, eq, gte, and, lt } from "drizzle-orm";
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

  // default: today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const period = typeof req.query.period === "string" ? req.query.period : "today";
  const { start, end } = getPeriodRange(period);

  const isYesterday = period === "yesterday";

  const salesWhere = isYesterday
    ? and(gte(salesTable.createdAt, start), lt(salesTable.createdAt, end))
    : gte(salesTable.createdAt, start);

  const purchasesWhere = isYesterday
    ? and(gte(purchasesTable.createdAt, start), lt(purchasesTable.createdAt, end))
    : gte(purchasesTable.createdAt, start);

  const expensesWhere = isYesterday
    ? and(gte(expensesTable.createdAt, start), lt(expensesTable.createdAt, end))
    : gte(expensesTable.createdAt, start);

  const [periodSalesRows, periodPurchasesRows, periodExpensesRows] = await Promise.all([
    db.select({ total: salesTable.total }).from(salesTable).where(salesWhere),
    db.select({ total: purchasesTable.total }).from(purchasesTable).where(purchasesWhere),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(expensesWhere),
  ]);

  const periodSales = periodSalesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodPurchases = periodPurchasesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const periodExpenses = periodExpensesRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const [customersCount, productsCount, suppliersCount] = await Promise.all([
    db.select({ id: customersTable.id }).from(customersTable),
    db.select({ id: productsTable.id }).from(productsTable),
    db.select({ id: suppliersTable.id }).from(suppliersTable),
  ]);

  const pendingCredits = await db.select({ remaining: creditsTable.remainingAmount })
    .from(creditsTable)
    .where(eq(creditsTable.status, "pending"));
  const pendingCreditsPartial = await db.select({ remaining: creditsTable.remainingAmount })
    .from(creditsTable)
    .where(eq(creditsTable.status, "partial"));
  const allPendingCredits = [...pendingCredits, ...pendingCreditsPartial];
  const pendingCreditTotal = allPendingCredits.reduce((sum, r) => sum + parseFloat(r.remaining), 0);

  const recentSalesWhere = isYesterday
    ? and(gte(salesTable.createdAt, start), lt(salesTable.createdAt, end))
    : gte(salesTable.createdAt, start);

  const recentSales = await db.select().from(salesTable)
    .where(period === "today" || isYesterday ? recentSalesWhere : undefined)
    .orderBy(desc(salesTable.createdAt))
    .limit(10);

  const accounts = await db.select().from(accountsTable);

  res.json({
    period,
    todaySales: periodSales.toFixed(8),
    todaySalesCount: periodSalesRows.length,
    todayPurchases: periodPurchases.toFixed(8),
    todayExpenses: periodExpenses.toFixed(8),
    totalCustomers: customersCount.length,
    totalProducts: productsCount.length,
    totalSuppliers: suppliersCount.length,
    pendingCredits: pendingCreditTotal.toFixed(8),
    pendingCreditsCount: allPendingCredits.length,
    recentSales: recentSales.map(s => ({
      ...s,
      items: [],
      customerName: null,
      locationName: null,
      accountName: null,
      createdAt: s.createdAt.toISOString(),
    })),
    accountBalances: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  });
});

export default router;
