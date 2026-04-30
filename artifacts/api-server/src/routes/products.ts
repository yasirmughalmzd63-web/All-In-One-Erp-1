import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, productsTable, categoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { requireAdmin, isAdmin } from "../lib/permissions.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

router.get("/products", requireAuth, async (req, res): Promise<void> => {
  const locationFilter = !isAdmin(req) && req.userLocationId != null
    ? eq(productsTable.locationId, req.userLocationId)
    : undefined;

  const tenantFilter = tenantWhere(req, productsTable.businessId);
  const where = and(tenantFilter, locationFilter);

  const rows = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    sku: productsTable.sku,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    unitPrice: productsTable.unitPrice,
    wholesalePrice: productsTable.wholesalePrice,
    costPrice: productsTable.costPrice,
    stock: productsTable.stock,
    locationId: productsTable.locationId,
    unit: productsTable.unit,
    isActive: productsTable.isActive,
    imageUrl: productsTable.imageUrl,
    topupCoinsPerUsd: productsTable.topupCoinsPerUsd,
    topupExchangeRatePkr: productsTable.topupExchangeRatePkr,
    createdAt: productsTable.createdAt,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(where)
    .orderBy(productsTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/products", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { name, sku, categoryId, unitPrice, wholesalePrice, costPrice, stock, locationId, unit, imageUrl } = req.body as {
    name?: string; sku?: string | null; categoryId?: number | null;
    unitPrice?: string; wholesalePrice?: string; costPrice?: string; stock?: number; locationId?: number | null; unit?: string; imageUrl?: string | null;
  };
  if (!name || !unitPrice || !costPrice || !unit) { res.status(400).json({ error: "name, unitPrice, costPrice, unit required" }); return; }
  const [row] = await db.insert(productsTable).values({
    name, sku: sku ?? null, categoryId: categoryId ?? null,
    unitPrice, wholesalePrice: wholesalePrice ?? unitPrice, costPrice,
    stock: stock ?? 0, locationId: locationId ?? null, unit, imageUrl: imageUrl ?? null,
    businessId: tenantStamp(req),
  }).returning();
  await logAudit(req.userId, "create", "product", row!.id, `Created product ${name}`);
  res.status(201).json({ ...row!, categoryName: null, createdAt: row!.createdAt.toISOString() });
});

router.patch("/products/:id", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: productsTable.businessId }).from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This product belongs to another business" }); return; }

  const { name, sku, categoryId, unitPrice, wholesalePrice, costPrice, stock, unit, isActive, locationId, imageUrl, topupCoinsPerUsd, topupExchangeRatePkr } = req.body as {
    name?: string; sku?: string | null; categoryId?: number | null;
    unitPrice?: string; wholesalePrice?: string; costPrice?: string; stock?: number; unit?: string; isActive?: boolean; locationId?: number | null; imageUrl?: string | null;
    topupCoinsPerUsd?: string | null; topupExchangeRatePkr?: string | null;
  };
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (sku !== undefined) updates.sku = sku;
  if (categoryId !== undefined) updates.categoryId = categoryId;
  if (unitPrice != null) updates.unitPrice = unitPrice;
  if (wholesalePrice != null) updates.wholesalePrice = wholesalePrice;
  if (costPrice != null) updates.costPrice = costPrice;
  if (stock != null) updates.stock = stock;
  if (unit != null) updates.unit = unit;
  if (isActive != null) updates.isActive = isActive;
  if (locationId !== undefined) updates.locationId = locationId;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (topupCoinsPerUsd !== undefined) updates.topupCoinsPerUsd = topupCoinsPerUsd;
  if (topupExchangeRatePkr !== undefined) updates.topupExchangeRatePkr = topupExchangeRatePkr;
  const [row] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  await logAudit(req.userId, "update", "product", id);
  res.json({ ...row, categoryName: null, createdAt: row.createdAt.toISOString() });
});

router.delete("/products/:id", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);

  const [existing] = await db.select({ businessId: productsTable.businessId }).from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "This product belongs to another business" }); return; }

  const [row] = await db.delete(productsTable).where(eq(productsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  await logAudit(req.userId, "delete", "product", id);
  res.sendStatus(204);
});

export default router;
