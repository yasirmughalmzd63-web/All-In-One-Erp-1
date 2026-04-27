import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, currencyTransactionsTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/currencies", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: currencyTransactionsTable.id,
    currencyType: currencyTransactionsTable.currencyType,
    type: currencyTransactionsTable.type,
    amount: currencyTransactionsTable.amount,
    rate: currencyTransactionsTable.rate,
    totalInBase: currencyTransactionsTable.totalInBase,
    accountId: currencyTransactionsTable.accountId,
    accountName: accountsTable.name,
    userId: currencyTransactionsTable.userId,
    notes: currencyTransactionsTable.notes,
    date: currencyTransactionsTable.date,
    createdAt: currencyTransactionsTable.createdAt,
  }).from(currencyTransactionsTable)
    .leftJoin(accountsTable, eq(currencyTransactionsTable.accountId, accountsTable.id))
    .orderBy(desc(currencyTransactionsTable.createdAt));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/currencies", requireAuth, async (req, res): Promise<void> => {
  const { currencyType, type, amount, rate, totalInBase, accountId, notes, date } = req.body as {
    currencyType?: string; type?: string; amount?: string; rate?: string; totalInBase?: string;
    accountId?: number | null; notes?: string | null; date?: string;
  };
  if (!amount || !rate || !totalInBase || !date) {
    res.status(400).json({ error: "amount, rate, totalInBase, date required" });
    return;
  }

  const ct = currencyType ?? "USD";
  const t = type ?? "purchase";
  const total = parseFloat(totalInBase);

  const [row] = await db.insert(currencyTransactionsTable).values({
    currencyType: ct, type: t,
    amount: parseFloat(amount).toFixed(8),
    rate: parseFloat(rate).toFixed(8),
    totalInBase: total.toFixed(8),
    accountId: accountId ?? null,
    userId: req.userId,
    notes: notes ?? null, date,
  }).returning();

  if (accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const newBal = t === "purchase"
        ? parseFloat(account.balance) - total
        : parseFloat(account.balance) + total;
      await db.update(accountsTable).set({ balance: newBal.toFixed(8) }).where(eq(accountsTable.id, accountId));
    }
  }

  await logAudit(req.userId, "create", "currency", row!.id, `${t} ${amount} ${ct} @ ${rate}`);
  res.status(201).json({ ...row!, accountName: null, createdAt: row!.createdAt.toISOString() });
});

router.delete("/currencies/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select().from(currencyTransactionsTable).where(eq(currencyTransactionsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, existing.accountId));
    if (account) {
      const reversal = existing.type === "purchase"
        ? parseFloat(account.balance) + parseFloat(existing.totalInBase)
        : parseFloat(account.balance) - parseFloat(existing.totalInBase);
      await db.update(accountsTable).set({ balance: reversal.toFixed(8) }).where(eq(accountsTable.id, existing.accountId));
    }
  }

  await db.delete(currencyTransactionsTable).where(eq(currencyTransactionsTable.id, id));
  await logAudit(req.userId, "delete", "currency", id);
  res.sendStatus(204);
});

export default router;
