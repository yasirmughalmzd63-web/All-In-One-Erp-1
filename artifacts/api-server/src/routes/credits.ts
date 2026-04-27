import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, creditsTable, customersTable, suppliersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

async function getPartyName(partyId: number, partyType: string): Promise<string> {
  if (partyType === "customer") {
    const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, partyId));
    return c?.name ?? "Unknown";
  } else {
    const [s] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, partyId));
    return s?.name ?? "Unknown";
  }
}

router.get("/credits", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(creditsTable).orderBy(desc(creditsTable.createdAt));
  const result = await Promise.all(rows.map(async (row) => {
    const partyName = await getPartyName(row.partyId, row.partyType);
    return { ...row, partyName, createdAt: row.createdAt.toISOString() };
  }));
  res.json(result);
});

router.post("/credits", requireAuth, async (req, res): Promise<void> => {
  const { type, partyId, partyType, amount, dueDate, notes, userId } = req.body as {
    type: string; partyId: number; partyType: string; amount: string;
    dueDate?: string | null; notes?: string | null; userId: number;
  };
  if (!type || !partyId || !partyType || !amount || !userId) { res.status(400).json({ error: "type, partyId, partyType, amount, userId required" }); return; }
  const [row] = await db.insert(creditsTable).values({
    type, partyId, partyType, amount, paidAmount: "0.00000000", remainingAmount: amount,
    dueDate: dueDate ?? null, notes: notes ?? null, userId, status: "pending",
  }).returning();
  const partyName = await getPartyName(partyId, partyType);
  await logAudit(req.userId, "create", "credit", row!.id);
  res.status(201).json({ ...row!, partyName, createdAt: row!.createdAt.toISOString() });
});

router.post("/credits/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { payAmount } = req.body as { payAmount: string; accountId?: number | null };
  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, id));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }
  const newPaid = parseFloat(credit.paidAmount) + parseFloat(payAmount);
  const newRemaining = parseFloat(credit.amount) - newPaid;
  const status = newRemaining <= 0 ? "paid" : "partial";
  const [updated] = await db.update(creditsTable).set({
    paidAmount: newPaid.toFixed(8), remainingAmount: Math.max(0, newRemaining).toFixed(8), status,
  }).where(eq(creditsTable.id, id)).returning();
  const partyName = await getPartyName(updated!.partyId, updated!.partyType);
  await logAudit(req.userId, "payment", "credit", id, `Paid ${payAmount}`);
  res.json({ ...updated!, partyName, createdAt: updated!.createdAt.toISOString() });
});

export default router;
