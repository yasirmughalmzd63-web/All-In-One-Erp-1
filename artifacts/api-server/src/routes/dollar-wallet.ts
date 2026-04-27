import { Router } from "express";
import { desc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, dollarWalletTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/dollar-wallet", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(dollarWalletTable).orderBy(desc(dollarWalletTable.createdAt));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/dollar-wallet", requireAuth, async (req, res): Promise<void> => {
  const { entryType, amountUsd, rate, totalPkr, partyName, notes, date } = req.body as {
    entryType?: string; amountUsd?: string; rate?: string; totalPkr?: string;
    partyName?: string | null; notes?: string | null; date?: string;
  };
  if (!amountUsd || !rate || !totalPkr || !date) {
    res.status(400).json({ error: "amountUsd, rate, totalPkr, date required" });
    return;
  }
  const [row] = await db.insert(dollarWalletTable).values({
    entryType: entryType ?? "received",
    amountUsd: parseFloat(amountUsd).toFixed(8),
    rate: parseFloat(rate).toFixed(8),
    totalPkr: parseFloat(totalPkr).toFixed(8),
    partyName: partyName ?? null,
    notes: notes ?? null,
    date,
    userId: String(req.userId),
  }).returning();
  await logAudit(req.userId, "create", "dollar_wallet", row!.id, `${entryType} ${amountUsd} USD @ ${rate}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.delete("/dollar-wallet/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select().from(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  await logAudit(req.userId, "delete", "dollar_wallet", id);
  res.sendStatus(204);
});

export default router;
