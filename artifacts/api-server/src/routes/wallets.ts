import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, walletsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/wallets", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, walletsTable.businessId);
  const rows = await db.select().from(walletsTable).where(tenant).orderBy(walletsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/wallets", requireAuth, async (req, res): Promise<void> => {
  const { name, type, balance, currency } = req.body as { name?: string; type?: string; balance?: string; currency?: string };
  if (!name || !type || !currency) { res.status(400).json({ error: "name, type, currency required" }); return; }
  const [row] = await db.insert(walletsTable).values({
    name, type, balance: balance ?? "0.00000000", currency,
    businessId: tenantStamp(req),
  }).returning();
  await logAudit(req.userId, "create", "wallet", row!.id);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/wallets/:id", requireAuth, async (req, res): Promise<void> => {
  const idParam = req.params.id;
  const id = parseInt(typeof idParam === "string" ? idParam : "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name } = req.body as { name?: string };
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) { res.status(400).json({ error: "name is required" }); return; }
  const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Wallet not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This wallet belongs to another business" }); return; }
  const [row] = await db.update(walletsTable).set({ name: trimmed }).where(eq(walletsTable.id, id)).returning();
  await logAudit(req.userId, "update", "wallet", id, `Renamed "${existing.name}" → "${trimmed}"`);
  res.json({ ...row!, createdAt: row!.createdAt.toISOString() });
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
    if (!ownsRow(req, from.businessId)) { res.status(403).json({ error: "Source wallet belongs to another business" }); return; }
    const newBal = parseFloat(from.balance) - amt;
    await db.update(walletsTable).set({ balance: newBal.toFixed(8) }).where(eq(walletsTable.id, fromWalletId));
  }
  if (toWalletId) {
    const [to] = await db.select().from(walletsTable).where(eq(walletsTable.id, toWalletId));
    if (!to) { res.status(404).json({ error: "Destination wallet not found" }); return; }
    if (!ownsRow(req, to.businessId)) { res.status(403).json({ error: "Destination wallet belongs to another business" }); return; }
    const newBal = parseFloat(to.balance) + amt;
    await db.update(walletsTable).set({ balance: newBal.toFixed(8) }).where(eq(walletsTable.id, toWalletId));
  }
  await logAudit(req.userId, "transfer", "wallet", undefined, `Transfer ${amount} ${notes ?? ""}`);
  res.json({ success: true, message: `Transferred ${amount} successfully` });
});

export default router;
