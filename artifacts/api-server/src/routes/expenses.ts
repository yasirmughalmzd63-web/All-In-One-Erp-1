import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, expensesTable, categoriesTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { canModify, isAdmin } from "../lib/permissions.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/expenses", requireAuth, async (req, res): Promise<void> => {
  const query = db.select({
    id: expensesTable.id,
    title: expensesTable.title,
    amount: expensesTable.amount,
    categoryId: expensesTable.categoryId,
    categoryName: categoriesTable.name,
    accountId: expensesTable.accountId,
    accountName: accountsTable.name,
    userId: expensesTable.userId,
    notes: expensesTable.notes,
    date: expensesTable.date,
    createdAt: expensesTable.createdAt,
  }).from(expensesTable)
    .leftJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
    .leftJoin(accountsTable, eq(expensesTable.accountId, accountsTable.id));

  const tenant = tenantWhere(req, expensesTable.businessId);
  const ownerFilter = !isAdmin(req) ? eq(expensesTable.userId, req.userId!) : undefined;
  const rows = await query.where(and(tenant, ownerFilter)).orderBy(desc(expensesTable.createdAt));

  res.json(rows.map(r => ({ ...r, categoryName: r.categoryName ?? null, accountName: r.accountName ?? null, createdAt: r.createdAt.toISOString() })));
});

router.post("/expenses", requireAuth, async (req, res): Promise<void> => {
  const { title, amount, categoryId, accountId, userId, notes, date } = req.body as {
    title?: string; amount?: string; categoryId?: number | null; accountId?: number | null;
    userId: number; notes?: string | null; date: string;
  };
  if (!title || !amount || !userId || !date) { res.status(400).json({ error: "title, amount, userId, date required" }); return; }

  const amtNum = parseFloat(amount);
  if (isNaN(amtNum) || amtNum <= 0) {
    res.status(422).json({ error: "Expense amount must be greater than zero." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    res.status(422).json({ error: `Invalid date "${date}". Use YYYY-MM-DD format.` });
    return;
  }

  if (accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) {
      res.status(422).json({ error: "Selected account does not exist." });
      return;
    }
    if (!ownsRow(req, account.businessId)) { res.status(403).json({ error: "Account belongs to another business" }); return; }
    if (!account.isActive) {
      res.status(422).json({ error: `Account "${account.name}" is inactive and cannot be used for expenses.` });
      return;
    }
    const currentBal = parseFloat(account.balance);
    if (currentBal < amtNum) {
      res.status(422).json({
        error: `Insufficient funds in "${account.name}". Available: ₨${currentBal.toFixed(2)}, Required: ₨${amtNum.toFixed(2)}.`,
      });
      return;
    }
  }

  const [row] = await db.insert(expensesTable).values({
    title, amount: amtNum.toFixed(8), categoryId: categoryId ?? null, accountId: accountId ?? null, userId, notes: notes ?? null, date,
    businessId: tenantStamp(req),
  }).returning();

  if (accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const newBal = parseFloat(account.balance) - amtNum;
      await db.update(accountsTable).set({ balance: newBal.toFixed(8) }).where(eq(accountsTable.id, accountId));
    }
  }
  await logAudit(req.userId, "create", "expense", row!.id, `Expense: ${title}`);
  res.status(201).json({ ...row!, categoryName: null, accountName: null, createdAt: row!.createdAt.toISOString() });
});

router.patch("/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({ userId: expensesTable.userId, businessId: expensesTable.businessId }).from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This expense belongs to another business" }); return; }
  if (!canModify(req, res, existing.userId)) return;

  const { title, amount, notes } = req.body as { title?: string; amount?: string; notes?: string | null };
  const updates: Record<string, unknown> = {};
  if (title != null) updates.title = title;
  if (amount != null) updates.amount = amount;
  if (notes !== undefined) updates.notes = notes;
  const [row] = await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  await logAudit(req.userId, "update", "expense", id);
  res.json({ ...row, categoryName: null, accountName: null, createdAt: row.createdAt.toISOString() });
});

router.delete("/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({ userId: expensesTable.userId, businessId: expensesTable.businessId }).from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This expense belongs to another business" }); return; }
  if (!canModify(req, res, existing.userId)) return;

  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  await logAudit(req.userId, "delete", "expense", id);
  res.sendStatus(204);
});

export default router;
