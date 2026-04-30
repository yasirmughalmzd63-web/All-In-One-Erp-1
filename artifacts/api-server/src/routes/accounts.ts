import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { isAdmin } from "../lib/permissions.js";

const router = Router();

router.get("/accounts", requireAuth, async (req, res): Promise<void> => {
  const rows = isAdmin(req) || req.userLocationId == null
    ? await db.select().from(accountsTable).orderBy(accountsTable.name)
    : await db.select().from(accountsTable)
        .where(eq(accountsTable.locationId, req.userLocationId))
        .orderBy(accountsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/accounts", requireAuth, async (req, res): Promise<void> => {
  const { name, type, balance, currency, locationId } = req.body as { name?: string; type?: string; balance?: string; currency?: string; locationId?: number | null };
  if (!name || !type || !currency) { res.status(400).json({ error: "name, type, currency required" }); return; }
  const [row] = await db.insert(accountsTable).values({ name, type, balance: balance ?? "0.00000000", currency, locationId: locationId ?? null }).returning();
  await logAudit(req.userId, "create", "account", row!.id);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, type, isActive, locationId } = req.body as { name?: string; type?: string; isActive?: boolean; locationId?: number | null };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (type != null) updates.type = type;
  if (isActive != null) updates.isActive = isActive;
  if (locationId !== undefined) updates.locationId = locationId;
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
    if (!from) { res.status(404).json({ error: "Source account not found." }); return; }
    if (!from.isActive) {
      res.status(422).json({ error: `Source account "${from.name}" is inactive and cannot send funds.` });
      return;
    }
    const fromBal = parseFloat(from.balance);
    if (fromBal < amt) {
      res.status(422).json({
        error: `Insufficient funds in "${from.name}". Available: ₨${fromBal.toFixed(2)}, Required: ₨${amt.toFixed(2)}.`,
      });
      return;
    }
    await db.update(accountsTable).set({ balance: (fromBal - amt).toFixed(8) }).where(eq(accountsTable.id, fromAccountId));
  }
  if (toAccountId) {
    const [to] = await db.select().from(accountsTable).where(eq(accountsTable.id, toAccountId));
    if (!to) { res.status(404).json({ error: "Destination account not found." }); return; }
    if (!to.isActive) {
      res.status(422).json({ error: `Destination account "${to.name}" is inactive and cannot receive funds.` });
      return;
    }
    await db.update(accountsTable).set({ balance: (parseFloat(to.balance) + amt).toFixed(8) }).where(eq(accountsTable.id, toAccountId));
  }
  await logAudit(req.userId, "transfer", "account", undefined, `Transfer ${amount} from account #${fromAccountId ?? "external"} to #${toAccountId ?? "external"}${notes ? ": " + notes : ""}`);
  res.json({ success: true, message: `Transferred ${amount} successfully` });
});

export default router;
