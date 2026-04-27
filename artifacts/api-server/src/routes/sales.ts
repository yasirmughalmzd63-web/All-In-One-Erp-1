import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, salesTable, saleItemsTable, productsTable, customersTable, locationsTable, accountsTable, usersTable, creditsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

function formatAmount(val: number): string {
  return val.toFixed(8);
}

function genInvoiceNo(): string {
  return "SAL-" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
}

router.get("/sales", requireAuth, async (_req, res): Promise<void> => {
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
  if (!items?.length || !userId) { res.status(400).json({ error: "userId and items required" }); return; }

  let subtotal = 0;
  const itemsWithTotal = items.map(item => {
    const lineTotal = parseFloat(item.unitPrice) * item.qty;
    subtotal += lineTotal;
    return { ...item, total: formatAmount(lineTotal) };
  });

  const discountAmt = parseFloat(discount ?? "0");
  const taxAmt = parseFloat(tax ?? "0");
  const total = subtotal - discountAmt + taxAmt;
  const paid = parseFloat(amountPaid ?? "0");
  const change = paid - total;

  const invoiceNo = genInvoiceNo();
  const [sale] = await db.insert(salesTable).values({
    invoiceNo,
    customerId: customerId ?? null,
    locationId: locationId ?? null,
    accountId: accountId ?? null,
    userId,
    subtotal: formatAmount(subtotal),
    discount: formatAmount(discountAmt),
    tax: formatAmount(taxAmt),
    total: formatAmount(total),
    amountPaid: formatAmount(paid),
    change: formatAmount(change),
    paymentMethod,
    status: "completed",
    notes: notes ?? null,
  }).returning();

  for (const item of itemsWithTotal) {
    await db.insert(saleItemsTable).values({ saleId: sale!.id, productId: item.productId, qty: item.qty, unitPrice: item.unitPrice, total: item.total });
    await db.update(productsTable).set({ stock: db.$count(productsTable) }).where(eq(productsTable.id, item.productId));
    const [product] = await db.select({ stock: productsTable.stock }).from(productsTable).where(eq(productsTable.id, item.productId));
    if (product) {
      const newStock = (product.stock ?? 0) - item.qty;
      await db.update(productsTable).set({ stock: Math.max(0, newStock) }).where(eq(productsTable.id, item.productId));
    }
  }

  const remaining = total - paid;

  if (accountId && paid > 0) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const newBal = parseFloat(account.balance) + paid;
      await db.update(accountsTable).set({ balance: formatAmount(newBal) }).where(eq(accountsTable.id, accountId));
    }
  }

  if (paymentMethod === "credit" && customerId && remaining > 0) {
    await db.insert(creditsTable).values({
      type: "receivable",
      partyId: customerId,
      partyType: "customer",
      amount: formatAmount(total),
      paidAmount: formatAmount(paid),
      remainingAmount: formatAmount(remaining),
      status: paid > 0 ? "partial" : "pending",
      notes: `Credit sale: ${invoiceNo}`,
      userId: req.userId,
    });
  }

  await logAudit(req.userId, "create", "sale", sale!.id, `Sale ${invoiceNo} total ${formatAmount(total)}`);
  res.status(201).json({ ...sale!, items: itemsWithTotal.map(i => ({ ...i, productName: "" })), customerName: null, locationName: null, accountName: null, createdAt: sale!.createdAt.toISOString() });
});

export default router;
