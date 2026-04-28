import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, locationsTable, accountsTable, usersTable, creditsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { canModify, isAdmin } from "../lib/permissions.js";

const router = Router();

function fmt(val: number): string { return val.toFixed(8); }

function genInvoiceNo(): string {
  return "SAL-" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

router.get("/sales", requireAuth, async (req, res): Promise<void> => {
  const locationFilter = !isAdmin(req) && req.userLocationId != null
    ? eq(salesTable.locationId, req.userLocationId)
    : undefined;

  const sales = await db.select({
    id: salesTable.id,
    invoiceNo: salesTable.invoiceNo,
    customerId: salesTable.customerId,
    customerName: customersTable.name,
    locationId: salesTable.locationId,
    locationName: locationsTable.name,
    accountId: salesTable.accountId,
    accountName: accountsTable.name,
    userId: salesTable.userId,
    subtotal: salesTable.subtotal,
    discount: salesTable.discount,
    tax: salesTable.tax,
    total: salesTable.total,
    amountPaid: salesTable.amountPaid,
    change: salesTable.change,
    paymentMethod: salesTable.paymentMethod,
    status: salesTable.status,
    notes: salesTable.notes,
    createdAt: salesTable.createdAt,
  }).from(salesTable)
    .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
    .leftJoin(locationsTable, eq(salesTable.locationId, locationsTable.id))
    .leftJoin(accountsTable, eq(salesTable.accountId, accountsTable.id))
    .where(locationFilter)
    .orderBy(desc(salesTable.createdAt))
    .limit(100);

  const result = await Promise.all(sales.map(async (sale) => {
    const items = await db.select({
      productId: saleItemsTable.productId,
      productName: productsTable.name,
      qty: saleItemsTable.qty,
      unitPrice: saleItemsTable.unitPrice,
      total: saleItemsTable.total,
    }).from(saleItemsTable)
      .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
      .where(eq(saleItemsTable.saleId, sale.id));
    return {
      ...sale,
      customerName: sale.customerName ?? null,
      locationName: sale.locationName ?? null,
      accountName: sale.accountName ?? null,
      items: items.map(i => ({ ...i, productName: i.productName ?? "" })),
      createdAt: sale.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.get("/sales/user-report", requireAuth, async (_req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, role: usersTable.role })
    .from(usersTable);
  const sales = await db.select({
    userId: salesTable.userId,
    total: salesTable.total,
    amountPaid: salesTable.amountPaid,
    paymentMethod: salesTable.paymentMethod,
    status: salesTable.status,
  }).from(salesTable);
  const saleItems = await db.select({
    saleId: saleItemsTable.saleId,
    qty: saleItemsTable.qty,
    total: saleItemsTable.total,
  }).from(saleItemsTable);
  const credits = await db.select({
    userId: creditsTable.userId,
    remainingAmount: creditsTable.remainingAmount,
    status: creditsTable.status,
  }).from(creditsTable);

  const saleItemMap: Record<number, { qty: number; total: number }> = {};
  saleItems.forEach(si => {
    if (!saleItemMap[si.saleId]) saleItemMap[si.saleId] = { qty: 0, total: 0 };
    saleItemMap[si.saleId]!.qty += si.qty;
    saleItemMap[si.saleId]!.total += parseFloat(si.total);
  });

  const report = users.map(u => {
    const userSales = sales.filter(s => s.userId === u.id);
    const stockIssued = userSales.reduce((sum, s) => {
      return sum + (saleItemMap[s.userId]?.qty ?? 0);
    }, 0);
    const cashCollected = userSales.reduce((sum, s) => sum + parseFloat(s.amountPaid), 0);
    const totalSales = userSales.reduce((sum, s) => sum + parseFloat(s.total), 0);
    const creditPending = credits.filter(c => c.userId === u.id && (c.status === "pending" || c.status === "partial"))
      .reduce((sum, c) => sum + parseFloat(c.remainingAmount), 0);
    return {
      userId: u.id, name: u.name, username: u.username, role: u.role,
      totalSales, cashCollected, creditPending, outstanding: totalSales - cashCollected,
    };
  });

  res.json(report);
});

router.get("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [sale] = await db.select().from(salesTable).where(eq(salesTable.id, id));
  if (!sale) { res.status(404).json({ error: "Sale not found" }); return; }
  const items = await db.select({
    productId: saleItemsTable.productId,
    productName: productsTable.name,
    qty: saleItemsTable.qty,
    unitPrice: saleItemsTable.unitPrice,
    total: saleItemsTable.total,
  }).from(saleItemsTable)
    .leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(eq(saleItemsTable.saleId, id));
  res.json({ ...sale, items: items.map(i => ({ ...i, productName: i.productName ?? "" })), createdAt: sale.createdAt.toISOString() });
});

router.post("/sales", requireAuth, async (req, res): Promise<void> => {
  const { customerId, locationId, accountId, userId, items, discount, tax, amountPaid, paymentMethod, notes } = req.body as {
    customerId?: number | null; locationId?: number | null; accountId?: number | null; userId: number;
    items: Array<{ productId: number; qty: number; unitPrice: string }>;
    discount: string; tax: string; amountPaid: string; paymentMethod: string; notes?: string | null;
  };

  if (!items?.length || !userId) {
    res.status(400).json({ error: "userId and items required" });
    return;
  }

  const paid = parseFloat(amountPaid ?? "0");
  const isCash = paymentMethod !== "credit";

  // Rule 1: Account required for cash payments
  if (isCash && !accountId) {
    res.status(422).json({ error: "An account must be selected for cash payments." });
    return;
  }

  // Location enforcement: non-admin users can only sell from their assigned location
  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId
    : (locationId ?? null);

  // Validate account belongs to user's location for non-admin
  if (!isAdmin(req) && req.userLocationId != null && accountId) {
    const [account] = await db.select({ locationId: accountsTable.locationId }).from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account && account.locationId != null && account.locationId !== req.userLocationId) {
      res.status(403).json({ error: "You can only use accounts assigned to your location." });
      return;
    }
  }

  // Rules 3, 4, 5: Stock validation for every item + location check
  for (const item of items) {
    const [product] = await db.select({ id: productsTable.id, name: productsTable.name, stock: productsTable.stock, locationId: productsTable.locationId })
      .from(productsTable).where(eq(productsTable.id, item.productId));
    if (!product) {
      res.status(422).json({ error: `Product not found (id ${item.productId}).` });
      return;
    }
    // Non-admin: product must belong to user's location
    if (!isAdmin(req) && req.userLocationId != null) {
      if (product.locationId !== req.userLocationId) {
        res.status(403).json({ error: `"${product.name}" is not available at your location.` });
        return;
      }
    }
    if ((product.stock ?? 0) <= 0) {
      res.status(422).json({ error: `"${product.name}" is out of stock.` });
      return;
    }
    if (item.qty > (product.stock ?? 0)) {
      res.status(422).json({ error: `Only ${product.stock} ${product.name} in stock, but ${item.qty} requested.` });
      return;
    }
    if (item.qty <= 0) {
      res.status(422).json({ error: `Quantity must be greater than zero.` });
      return;
    }
  }

  // Calculate totals
  let subtotal = 0;
  const itemsWithTotal = items.map(item => {
    const lineTotal = parseFloat(item.unitPrice) * item.qty;
    subtotal += lineTotal;
    return { ...item, total: fmt(lineTotal) };
  });

  const discountAmt = parseFloat(discount ?? "0");
  const taxAmt = parseFloat(tax ?? "0");
  const total = subtotal - discountAmt + taxAmt;
  const change = paid - total;

  // Rule 2: Account balance must be sufficient for cash payments
  if (isCash && accountId && paid > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) {
      res.status(422).json({ error: "Selected account not found." });
      return;
    }
    // Note: for sales, we ADD to account (money received from customer)
    // So balance check: account must exist (no minimum required for receiving)
  }

  const invoiceNo = genInvoiceNo();
  const [sale] = await db.insert(salesTable).values({
    invoiceNo,
    customerId: customerId ?? null,
    locationId: effectiveLocationId,
    accountId: accountId ?? null,
    userId,
    subtotal: fmt(subtotal),
    discount: fmt(discountAmt),
    tax: fmt(taxAmt),
    total: fmt(total),
    amountPaid: fmt(paid),
    change: fmt(change),
    paymentMethod,
    status: "completed",
    notes: notes ?? null,
  }).returning();

  // Deduct stock — guaranteed no negative (validated above)
  for (const item of itemsWithTotal) {
    await db.insert(saleItemsTable).values({
      saleId: sale!.id,
      productId: item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      total: item.total,
    });
    const [product] = await db.select({ stock: productsTable.stock })
      .from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      const newStock = Math.max(0, (product.stock ?? 0) - item.qty);
      await db.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, item.productId));
    }
  }

  // Credit account with received cash
  if (accountId && paid > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const newBal = parseFloat(account.balance) + paid;
      await db.update(accountsTable).set({ balance: fmt(newBal) }).where(eq(accountsTable.id, accountId));
    }
  }

  const remaining = total - paid;
  if (paymentMethod === "credit" && customerId && remaining > 0) {
    await db.insert(creditsTable).values({
      type: "receivable",
      partyId: customerId,
      partyType: "customer",
      amount: fmt(total),
      paidAmount: fmt(paid),
      remainingAmount: fmt(remaining),
      status: paid > 0 ? "partial" : "pending",
      notes: `Credit sale: ${invoiceNo}`,
      userId: req.userId,
    });
  }

  await logAudit(req.userId, "create", "sale", sale!.id, `Sale ${invoiceNo} total ${fmt(total)}`);
  res.status(201).json({
    ...sale!,
    items: itemsWithTotal.map(i => ({ ...i, productName: "" })),
    customerName: null, locationName: null, accountName: null,
    createdAt: sale!.createdAt.toISOString(),
  });
});

router.delete("/sales/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({
    userId: salesTable.userId, accountId: salesTable.accountId,
    total: salesTable.total, amountPaid: salesTable.amountPaid,
  }).from(salesTable).where(eq(salesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Sale not found" }); return; }
  if (!canModify(req, res, existing.userId)) return;

  // Restore stock
  const items = await db.select().from(saleItemsTable).where(eq(saleItemsTable.saleId, id));
  for (const item of items) {
    const [product] = await db.select({ stock: productsTable.stock })
      .from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      await db.update(productsTable).set({ stock: (product.stock ?? 0) + item.qty }).where(eq(productsTable.id, item.productId));
    }
  }

  await db.delete(saleItemsTable).where(eq(saleItemsTable.saleId, id));
  await db.delete(salesTable).where(eq(salesTable.id, id));

  // Reverse account credit
  if (existing.accountId && parseFloat(existing.amountPaid) > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, existing.accountId));
    if (account) {
      const newBal = parseFloat(account.balance) - parseFloat(existing.amountPaid);
      await db.update(accountsTable).set({ balance: fmt(newBal) }).where(eq(accountsTable.id, existing.accountId));
    }
  }

  await logAudit(req.userId, "delete", "sale", id);
  res.sendStatus(204);
});

export default router;
