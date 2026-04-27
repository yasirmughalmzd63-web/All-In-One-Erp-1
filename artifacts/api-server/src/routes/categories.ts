import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/categories", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const { name, type, description } = req.body as { name?: string; type?: string; description?: string | null };
  if (!name || !type) { res.status(400).json({ error: "name, type required" }); return; }
  const [row] = await db.insert(categoriesTable).values({ name, type, description: description ?? null }).returning();
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { name, description } = req.body as { name?: string; description?: string | null };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (description !== undefined) updates.description = description;
  const [row] = await db.update(categoriesTable).set(updates).where(eq(categoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(categoriesTable).where(eq(categoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.sendStatus(204);
});

export default router;
