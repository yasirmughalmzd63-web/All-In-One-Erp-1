import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, purchasesTable, purchaseItemsTable, productsTable, suppliersTable, locationsTable, accountsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { canModify, isAdmin } from "../lib/permissions.js";

const router = Router();

function formatAmount(val: number): string {
  return val.toFixed(8);
}

function genInvoiceNo(): string {
  return "PUR-" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

router.get("/purchases", requireAuth, async (req, res): Promise<void> => {
  const locationFilter = !isAdmin(req) && req.userLocationId != null
    ? eq(purchasesTable.locationId, req.userLocationId)
    : undefined;

  const rows = await db.select({
    id: purchasesTable.id,
    invoiceNo: purchasesTable.invoiceNo,
    supplierId: purchasesTable.supplierId,
    supplierName: suppliersTable.name,
    locationId: purchasesTable.locationId,
    accountId: purchasesTable.accountId,
    userId: purchasesTable.userId,
    subtotal: purchasesTable.subtotal,
    discount: purchasesTable.discount,
    total: purchasesTable.total,
    amountPaid: purchasesTable.amountPaid,
    status: purchasesTable.status,
    notes: purchasesTable.notes,
    createdAt: purchasesTable.createdAt,
  }).from(purchasesTable)
    .leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id))
    .where(locationFilter)
    .orderBy(desc(purchasesTable.createdAt))
    .limit(100);

  const result = await Promise.all(rows.map(async (row) => {
    const items = await db.select({
      productId: purchaseItemsTable.productId,
      productName: productsTable.name,
      qty: purchaseItemsTable.qty,
      unitCost: purchaseItemsTable.unitCost,
      total: purchaseItemsTable.total,
    }).from(purchaseItemsTable)
      .leftJoin(productsTable, eq(purchaseItemsTable.productId, productsTable.id))
      .where(eq(purchaseItemsTable.purchaseId, row.id));
    return { ...row, supplierName: row.supplierName ?? null, items: items.map(i => ({ ...i, productName: i.productName ?? "" })), createdAt: row.createdAt.toISOString() };
  }));
  res.json(result);
});

router.get("/purchases/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [row] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  const items = await db.select({
    productId: purchaseItemsTable.productId,
    productName: productsTable.name,
    qty: purchaseItemsTable.qty,
    unitCost: purchaseItemsTable.unitCost,
    total: purchaseItemsTable.total,
  }).from(purchaseItemsTable)
    .leftJoin(productsTable, eq(purchaseItemsTable.productId, productsTable.id))
    .where(eq(purchaseItemsTable.purchaseId, id));
  res.json({ ...row, items: items.map(i => ({ ...i, productName: i.productName ?? "" })), createdAt: row.createdAt.toISOString() });
});

router.post("/purchases", requireAuth, async (req, res): Promise<void> => {
  const { supplierId, locationId, accountId, userId, items, discount, amountPaid, notes } = req.body as {
    supplierId?: number | null; locationId?: number | null; accountId?: number | null; userId: number;
    items: Array<{ productId: number; qty: number; unitCost: string }>;
    discount: string; amountPaid: string; notes?: string | null;
  };
  if (!items?.length || !userId) { res.status(400).json({ error: "userId and items required" }); return; }

  // Location enforcement for non-admin
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId
    : (locationId ?? null);

  // Per-item validation
  for (const item of items) {
    if (!item.productId) {
      res.status(422).json({ error: "Each item must have a productId." });
      return;
    }
    if (item.qty <= 0 || !Number.isFinite(item.qty)) {
      res.status(422).json({ error: `Item quantity must be greater than zero (got ${item.qty}).` });
      return;
    }
    const costNum = parseFloat(item.unitCost);
    if (isNaN(costNum) || costNum <= 0) {
      res.status(422).json({ error: `Unit cost must be greater than zero (got "${item.unitCost}").` });
      return;
    }
  }

  const discountAmt = parseFloat(discount ?? "0");
  if (isNaN(discountAmt) || discountAmt < 0) {
    res.status(422).json({ error: "Discount must be zero or a positive number." });
    return;
  }

  const paid = parseFloat(amountPaid ?? "0");
  if (isNaN(paid) || paid < 0) {
    res.status(422).json({ error: "Amount paid must be zero or a positive number." });
    return;
  }

  // Validate account belongs to user's location for non-admin
  if (!isAdmin(req) && req.userLocationId != null && accountId) {
    const [account] = await db.select({ locationId: accountsTable.locationId }).from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account && account.locationId != null && account.locationId !== req.userLocationId) {
      res.status(403).json({ error: "You can only use accounts assigned to your location." });
      return;
    }
  }

  let subtotal = 0;
  const itemsWithTotal = items.map(item => {
    const lineTotal = parseFloat(item.unitCost) * item.qty;
    subtotal += lineTotal;
    return { ...item, total: lineTotal.toFixed(8) };
  });

  const total = subtotal - discountAmt;

  if (paid > 0 && !accountId) {
    res.status(422).json({ error: "An account must be selected when recording a payment." });
    return;
  }

  if (accountId && paid > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) {
      res.status(422).json({ error: "Selected account does not exist." });
      return;
    }
    if (!account.isActive) {
      res.status(422).json({ error: `Account "${account.name}" is inactive and cannot be used for payments.` });
      return;
    }
    const currentBal = parseFloat(account.balance);
    if (currentBal < paid) {
      res.status(422).json({
        error: `Insufficient funds in "${account.name}". Available: ₨${currentBal.toFixed(2)}, Required: ₨${paid.toFixed(2)}.`,
      });
      return;
    }
  }

  const invoiceNo = genInvoiceNo();
  const [purchase] = await db.insert(purchasesTable).values({
    invoiceNo, supplierId: supplierId ?? null, locationId: effectiveLocationId, accountId: accountId ?? null,
    userId, subtotal: formatAmount(subtotal), discount: formatAmount(discountAmt), total: formatAmount(total),
    amountPaid: formatAmount(paid), status: "completed", notes: notes ?? null,
  }).returning();

  for (const item of itemsWithTotal) {
    await db.insert(purchaseItemsTable).values({ purchaseId: purchase!.id, productId: item.productId, qty: item.qty, unitCost: item.unitCost, total: item.total });
    const [product] = await db.select({ stock: productsTable.stock }).from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      await db.update(productsTable).set({ stock: (product.stock ?? 0) + item.qty }).where(eq(productsTable.id, item.productId));
    }
  }

  if (accountId && paid > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const newBal = parseFloat(account.balance) - paid;
      await db.update(accountsTable).set({ balance: formatAmount(newBal) }).where(eq(accountsTable.id, accountId));
    }
  }

  await logAudit(req.userId, "create", "purchase", purchase!.id, `Purchase ${invoiceNo}`);
  res.status(201).json({ ...purchase!, supplierName: null, items: itemsWithTotal.map(i => ({ ...i, productName: "" })), createdAt: purchase!.createdAt.toISOString() });
});

router.delete("/purchases/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({ userId: purchasesTable.userId, accountId: purchasesTable.accountId, total: purchasesTable.total })
    .from(purchasesTable).where(eq(purchasesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Purchase not found" }); return; }
  if (!canModify(req, res, existing.userId)) return;

  await db.delete(purchaseItemsTable).where(eq(purchaseItemsTable.purchaseId, id));
  await db.delete(purchasesTable).where(eq(purchasesTable.id, id));

  if (existing.accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, existing.accountId));
    if (account) {
      const newBal = parseFloat(account.balance) + parseFloat(existing.total);
      await db.update(accountsTable).set({ balance: newBal.toFixed(8) }).where(eq(accountsTable.id, existing.accountId));
    }
  }

  await logAudit(req.userId, "delete", "purchase", id);
  res.sendStatus(204);
});

export default router;
