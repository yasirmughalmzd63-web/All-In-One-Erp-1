import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/wallets", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(walletsTable).orderBy(walletsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/wallets", requireAuth, async (req, res): Promise<void> => {
  const { name, type, balance, currency } = req.body as { name?: string; type?: string; balance?: string; currency?: string };
  if (!name || !type || !currency) { res.status(400).json({ error: "name, type, currency required" }); return; }
  const [row] = await db.insert(walletsTable).values({ name, type, balance: balance ?? "0.00000000", currency }).returning();
  await logAudit(req.userId, "create", "wallet", row!.id);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.post("/wallets/transfer", requireAuth, async (req, res): Promise<void> => {
  const { fromWalletId, toWalletId, amount, notes } = req.body as {
    fromWalletId?: number | null; toWalletId?: number | null; amount: string; notes?: string | null;
  };
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }

  if (fromWalletId) {
    const [from] = await db.select().from(walletsTable).where(eq(walletsTable.id, fromWalletId));
    if (!from) { res.status(404).json({ error: "Source wallet not found" }); return; }
    const newBal = parseFloat(from.balance) - amt;
    await db.update(walletsTable).set({ balance: newBal.toFixed(8) }).where(eq(walletsTable.id, fromWalletId));
  }
  if (toWalletId) {
    const [to] = await db.select().from(walletsTable).where(eq(walletsTable.id, toWalletId));
    if (!to) { res.status(404).json({ error: "Destination wallet not found" }); return; }
    const newBal = parseFloat(to.balance) + amt;
    await db.update(walletsTable).set({ balance: newBal.toFixed(8) }).where(eq(walletsTable.id, toWalletId));
  }
  await logAudit(req.userId, "transfer", "wallet", undefined, `Transfer ${amount} ${notes ?? ""}`);
  res.json({ success: true, message: `Transferred ${amount} successfully` });
});

export default router;
