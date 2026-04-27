import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/locations", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(locationsTable).orderBy(locationsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/locations", requireAuth, async (req, res): Promise<void> => {
  const { name, address, phone } = req.body as { name?: string; address?: string | null; phone?: string | null };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(locationsTable).values({ name, address: address ?? null, phone: phone ?? null }).returning();
  await logAudit(req.userId, "create", "location", row!.id, `Created location ${name}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, address, phone, isActive } = req.body as { name?: string; address?: string | null; phone?: string | null; isActive?: boolean };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (phone !== undefined) updates.phone = phone;
  if (isActive != null) updates.isActive = isActive;
  const [row] = await db.update(locationsTable).set(updates).where(eq(locationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Location not found" }); return; }
  await logAudit(req.userId, "update", "location", id);
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(locationsTable).where(eq(locationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Location not found" }); return; }
  await logAudit(req.userId, "delete", "location", id);
  res.sendStatus(204);
});

export default router;
