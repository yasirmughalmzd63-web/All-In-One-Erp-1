import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, suppliersTable.businessId);
  const locationFilter = !isAdmin(req) && req.userLocationId != null
    ? eq(suppliersTable.locationId, req.userLocationId)
    : undefined;
  const rows = await db.select().from(suppliersTable).where(and(tenant, locationFilter)).orderBy(suppliersTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/suppliers", requireAuth, async (req, res): Promise<void> => {
  const { name, phone, email, address, locationId } = req.body as {
    name?: string; phone?: string | null; email?: string | null; address?: string | null; locationId?: number | null;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  // Non-admin: force their own location
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId
    : (locationId ?? null);

  const [row] = await db.insert(suppliersTable).values({
    name, phone: phone ?? null, email: email ?? null, address: address ?? null,
    locationId: effectiveLocationId,
    businessId: tenantStamp(req),
  }).returning();
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: suppliersTable.businessId }).from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Supplier not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This supplier belongs to another business" }); return; }

  const { name, phone, email, address, locationId } = req.body as {
    name?: string; phone?: string | null; email?: string | null; address?: string | null; locationId?: number | null;
  };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (address !== undefined) updates.address = address;
  if (locationId !== undefined) updates.locationId = locationId;
  const [row] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/suppliers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: suppliersTable.businessId }).from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Supplier not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This supplier belongs to another business" }); return; }

  const [row] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Supplier not found" }); return; }
  res.sendStatus(204);
});

export default router;
