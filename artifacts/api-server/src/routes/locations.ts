import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, locationsTable, productsTable, stockTransfersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { requireAdminOrManager } from "../lib/permissions.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/locations", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(locationsTable).orderBy(locationsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/locations", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "super_admin") { res.status(403).json({ error: "Only super admins can create locations" }); return; }
  const { name, address, phone } = req.body as { name?: string; address?: string | null; phone?: string | null };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [row] = await db.insert(locationsTable).values({ name, address: address ?? null, phone: phone ?? null }).returning();
  await logAudit(req.userId, "create", "location", row!.id, `Created location ${name}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.patch("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.userRole !== "super_admin") { res.status(403).json({ error: "Only super admins can modify locations" }); return; }
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
  if (req.userRole !== "super_admin") { res.status(403).json({ error: "Only super admins can delete locations" }); return; }
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.delete(locationsTable).where(eq(locationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Location not found" }); return; }
  await logAudit(req.userId, "delete", "location", id);
  res.sendStatus(204);
});

// ── Stock Transfers ─────────────────────────────────────────────────────────

router.get("/locations/stock-transfers", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdminOrManager(req, res)) return;
  const tenant = tenantWhere(req, stockTransfersTable.businessId);
  const rows = await db
    .select({
      id: stockTransfersTable.id,
      qty: stockTransfersTable.qty,
      notes: stockTransfersTable.notes,
      userId: stockTransfersTable.userId,
      createdAt: stockTransfersTable.createdAt,
      fromLocationId: stockTransfersTable.fromLocationId,
      toLocationId: stockTransfersTable.toLocationId,
      fromProductId: stockTransfersTable.fromProductId,
      toProductId: stockTransfersTable.toProductId,
      fromLocationName: sql<string>`fl.name`,
      toLocationName: sql<string>`tl.name`,
      fromProductName: sql<string>`fp.name`,
      toProductName: sql<string>`tp.name`,
    })
    .from(stockTransfersTable)
    .leftJoin(sql`locations fl`, sql`fl.id = ${stockTransfersTable.fromLocationId}`)
    .leftJoin(sql`locations tl`, sql`tl.id = ${stockTransfersTable.toLocationId}`)
    .leftJoin(sql`products fp`, sql`fp.id = ${stockTransfersTable.fromProductId}`)
    .leftJoin(sql`products tp`, sql`tp.id = ${stockTransfersTable.toProductId}`)
    .where(tenant)
    .orderBy(desc(stockTransfersTable.createdAt))
    .limit(100);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/locations/stock-transfer", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdminOrManager(req, res)) return;
  const { fromLocationId, toLocationId, fromProductId, toProductId, qty, notes } =
    req.body as { fromLocationId?: number; toLocationId?: number; fromProductId?: number; toProductId?: number; qty?: number; notes?: string };

  if (!fromLocationId || !toLocationId || !fromProductId || !toProductId || !qty) {
    res.status(400).json({ error: "fromLocationId, toLocationId, fromProductId, toProductId, qty required" });
    return;
  }
  if (qty <= 0) { res.status(400).json({ error: "qty must be positive" }); return; }
  if (fromProductId === toProductId) { res.status(400).json({ error: "Source and destination product must be different" }); return; }

  // Check source product has enough stock & belongs to caller's business
  const [fromProduct] = await db.select().from(productsTable).where(eq(productsTable.id, fromProductId));
  if (!fromProduct) { res.status(404).json({ error: "Source product not found" }); return; }
  if (!ownsRow(req, fromProduct.businessId)) { res.status(403).json({ error: "Source product belongs to another business" }); return; }
  if ((fromProduct.stock ?? 0) < qty) {
    res.status(422).json({ error: `Insufficient stock. Available: ${fromProduct.stock ?? 0}` });
    return;
  }

  // Deduct from source product, add to destination product
  await db.update(productsTable).set({ stock: (fromProduct.stock ?? 0) - qty }).where(eq(productsTable.id, fromProductId));
  const [toProduct] = await db.select().from(productsTable).where(eq(productsTable.id, toProductId));
  if (!toProduct) { res.status(404).json({ error: "Destination product not found" }); return; }
  if (!ownsRow(req, toProduct.businessId)) { res.status(403).json({ error: "Destination product belongs to another business" }); return; }
  await db.update(productsTable).set({ stock: (toProduct.stock ?? 0) + qty }).where(eq(productsTable.id, toProductId));

  // Record the transfer
  const [row] = await db.insert(stockTransfersTable).values({
    fromLocationId, toLocationId, fromProductId, toProductId, qty,
    notes: notes ?? null, userId: req.userId,
    businessId: tenantStamp(req),
  }).returning();

  await logAudit(req.userId, "create", "stock_transfer", row!.id,
    `Transferred ${qty} units from product #${fromProductId} (loc #${fromLocationId}) to product #${toProductId} (loc #${toLocationId})`);

  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

export default router;
