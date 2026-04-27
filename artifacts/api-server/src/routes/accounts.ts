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

export default router;
