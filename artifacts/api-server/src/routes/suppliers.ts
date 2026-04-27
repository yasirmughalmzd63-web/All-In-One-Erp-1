import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/suppliers", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email, address } = req.body as { name?: string; phone?: string | null; email?: string | null; address?: string | null };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(suppliersTable).values({ name, phone: phone ?? null, email: email ?? null, address: address ?? null }).returning();
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, phone, email, address } = req.body as { name?: string; phone?: string | null; email?: string | null; address?: string | null };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  const [row] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.sendStatus(204);
});

export default router;
