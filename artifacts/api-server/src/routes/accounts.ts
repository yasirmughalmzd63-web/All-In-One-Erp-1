import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/accounts", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(accountsTable).orderBy(accountsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/accounts", requireAuth, async (req, res): Promise<void> => {
  const { name, type, balance, currency } = req.body as { name?: string; type?: string; balance?: string; currency?: string };
  if (!name || !type || !currency) { res.status(400).json({ error: "name, type, currency required" }); return; }
  const [row] = await db.insert(accountsTable).values({ name, type, balance: balance ?? "0.00000000", currency }).returning();
  await logAudit(req.userId, "create", "account", row!.id);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, type, isActive } = req.body as { name?: string; type?: string; isActive?: boolean };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (type != null) updates.type = type;
  if (isActive != null) updates.isActive = isActive;
  const [row] = await db.update(accountsTable).set(updates).where(eq(accountsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Account not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(accountsTable).where(eq(accountsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Account not found" }); return; }
  res.sendStatus(204);
});

router.post("/accounts/transfer", requireAuth, async (req, res): Promise<void> => {
  const { fromAccountId, toAccountId, amount, notes } = req.body as {
    fromAccountId?: number | null; toAccountId?: number | null; amount: string; notes?: string | null;
  };
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  if (!fromAccountId && !toAccountId) { res.status(400).json({ error: "At least one account required" }); return; }
  if (fromAccountId === toAccountId) { res.status(400).json({ error: "Source and destination cannot be the same" }); return; }

  if (fromAccountId) {
    const [from] = await db.select().from(accountsTable).where(eq(accountsTable.id, fromAccountId));
    if (!from) { res.status(404).json({ error: "Source account not found" }); return; }
    await db.update(accountsTable).set({ balance: (parseFloat(from.balance) - amt).toFixed(8) }).where(eq(accountsTable.id, fromAccountId));
  }
  if (toAccountId) {
    const [to] = await db.select().from(accountsTable).where(eq(accountsTable.id, toAccountId));
    if (!to) { res.status(404).json({ error: "Destination account not found" }); return; }
    await db.update(accountsTable).set({ balance: (parseFloat(to.balance) + amt).toFixed(8) }).where(eq(accountsTable.id, toAccountId));
  }
  await logAudit(req.userId, "transfer", "account", undefined, `Transfer ${amount} from account #${fromAccountId ?? "external"} to #${toAccountId ?? "external"}${notes ? ": " + notes : ""}`);
  res.json({ success: true, message: `Transferred ${amount} successfully` });
});

export default router;
