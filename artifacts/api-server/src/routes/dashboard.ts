import { Router } from "express";
import { desc, eq, gte } from "drizzle-orm";
import { db, salesTable, purchasesTable, expensesTable, creditsTable, customersTable, productsTable, suppliersTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/dashboard", requireAuth, async (_req, res): Promise<void> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySalesRows, todayPurchasesRows, todayExpensesRows] = await Promise.all([
    db.select({ total: salesTable.total }).from(salesTable).where(gte(salesTable.createdAt, todayStart)),
    db.select({ total: purchasesTable.total }).from(purchasesTable).where(gte(purchasesTable.createdAt, todayStart)),
    db.select({ amount: expensesTable.amount }).from(expensesTable).where(gte(expensesTable.createdAt, todayStart)),
  ]);

  const todaySales = todaySalesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const todayPurchases = todayPurchasesRows.reduce((sum, r) => sum + parseFloat(r.total), 0);
  const todayExpenses = todayExpensesRows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

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

  const recentSales = await db.select().from(salesTable).orderBy(desc(salesTable.createdAt)).limit(5);
  const accounts = await db.select().from(accountsTable);

  res.json({
    todaySales: todaySales.toFixed(8),
    todaySalesCount: todaySalesRows.length,
    todayPurchases: todayPurchases.toFixed(8),
    todayExpenses: todayExpenses.toFixed(8),
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
