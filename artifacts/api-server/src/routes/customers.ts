import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, customersTable, creditsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/customers", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(customersTable).orderBy(customersTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email, address, openingCreditBalance, openingCreditType } = req.body as {
    name?: string; phone?: string | null; email?: string | null; address?: string | null;
    openingCreditBalance?: string | number | null; openingCreditType?: string | null;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [customer] = await db.insert(customersTable).values({
    name, phone: phone ?? null, email: email ?? null, address: address ?? null,
  }).returning();

  const balanceNum = openingCreditBalance ? parseFloat(String(openingCreditBalance)) : 0;
  if (balanceNum > 0 && customer) {
    const creditType = openingCreditType === "payable" ? "payable" : "receivable";
    const balanceStr = balanceNum.toFixed(8);
    await db.insert(creditsTable).values({
      type: creditType,
      partyId: customer.id,
      partyType: "customer",
      amount: balanceStr,
      paidAmount: "0.00000000",
      remainingAmount: balanceStr,
      status: "pending",
      notes: "Opening balance",
      userId: req.userId ?? 1,
    });
  }

  res.status(201).json({ ...customer!, createdAt: customer!.createdAt.toISOString() });
});

router.patch("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, phone, email, address } = req.body as { name?: string; phone?: string | null; email?: string | null; address?: string | null };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  const [row] = await db.update(customersTable).set(updates).where(eq(customersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/customers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(customersTable).where(eq(customersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.sendStatus(204);
});

export default router;
