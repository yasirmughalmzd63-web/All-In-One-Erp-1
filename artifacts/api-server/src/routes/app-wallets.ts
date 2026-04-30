import { Router } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, productsTable, dollarWalletTable, saleItemsTable, salesTable, appCoinCreditsTable, appCoinCreditPaymentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();
const fmt = (n: number, d = 8) => n.toFixed(d);

// GET /api/app-wallets — summary for all products
router.get("/app-wallets", requireAuth, async (req, res): Promise<void> => {
  const tProd = tenantWhere(req, productsTable.businessId);
  const tDollar = tenantWhere(req, dollarWalletTable.businessId);
  const tSales = tenantWhere(req, salesTable.businessId);
  const tCredits = tenantWhere(req, appCoinCreditsTable.businessId);

  const products = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    unit: productsTable.unit,
    stock: productsTable.stock,
    costPrice: productsTable.costPrice,
    unitPrice: productsTable.unitPrice,
    wholesalePrice: productsTable.wholesalePrice,
    topupCoinsPerUsd: productsTable.topupCoinsPerUsd,
    topupExchangeRatePkr: productsTable.topupExchangeRatePkr,
  }).from(productsTable).where(and(eq(productsTable.isActive, true), tProd)).orderBy(productsTable.name);

  // Aggregate dollar topups per product
  const topupRows = await db
    .select({
      productId: dollarWalletTable.productId,
      totalUsd: sql<string>`coalesce(sum(${dollarWalletTable.amountUsd}::numeric), 0)`,
      totalPkr: sql<string>`coalesce(sum(${dollarWalletTable.totalPkr}::numeric), 0)`,
      totalCoins: sql<string>`coalesce(sum(${dollarWalletTable.qty}), 0)`,
      walletCount: sql<string>`count(*)`,
      directCount: sql<string>`count(*) filter (where ${dollarWalletTable.paymentMode} = 'direct')`,
    })
    .from(dollarWalletTable)
    .where(and(eq(dollarWalletTable.entryType, "topup"), tDollar))
    .groupBy(dollarWalletTable.productId);

  // Aggregate coin sales per product (from sale_items)
  const salesRows = await db
    .select({
      productId: saleItemsTable.productId,
      soldQty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
      soldPkr: sql<string>`coalesce(sum(${saleItemsTable.total}::numeric), 0)`,
    })
    .from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(eq(salesTable.status, "completed"), tSales))
    .groupBy(saleItemsTable.productId);

  // Aggregate outstanding credit per product
  const creditRows = await db
    .select({
      productId: appCoinCreditsTable.productId,
      totalCredited: sql<string>`coalesce(sum(${appCoinCreditsTable.totalPkr}::numeric), 0)`,
      totalPaid: sql<string>`coalesce(sum(${appCoinCreditsTable.paidPkr}::numeric), 0)`,
      totalRemaining: sql<string>`coalesce(sum(${appCoinCreditsTable.remainingPkr}::numeric), 0)`,
      totalQty: sql<string>`coalesce(sum(${appCoinCreditsTable.qty}), 0)`,
      pendingCount: sql<string>`count(*) filter (where ${appCoinCreditsTable.status} in ('pending','partial'))`,
    })
    .from(appCoinCreditsTable)
    .where(tCredits)
    .groupBy(appCoinCreditsTable.productId);

  const topupMap = Object.fromEntries(topupRows.map(r => [String(r.productId), r]));
  const salesMap = Object.fromEntries(salesRows.map(r => [String(r.productId), r]));
  const creditMap = Object.fromEntries(creditRows.map(r => [String(r.productId), r]));

  const result = products.map(p => {
    const t = topupMap[String(p.id)];
    const s = salesMap[String(p.id)];
    const c = creditMap[String(p.id)];
    return {
      ...p,
      usdInvested: t ? parseFloat(t.totalUsd).toFixed(2) : "0.00",
      pkrInvested: t ? parseFloat(t.totalPkr).toFixed(2) : "0.00",
      coinsIn: t ? parseInt(t.totalCoins) : 0,
      walletTopups: t ? parseInt(t.walletCount) - parseInt(t.directCount) : 0,
      directTopups: t ? parseInt(t.directCount) : 0,
      coinsSold: s ? parseInt(s.soldQty) : 0,
      pkrRevenue: s ? parseFloat(s.soldPkr).toFixed(2) : "0.00",
      creditTotalPkr: c ? parseFloat(c.totalCredited).toFixed(2) : "0.00",
      creditPaidPkr: c ? parseFloat(c.totalPaid).toFixed(2) : "0.00",
      creditRemainingPkr: c ? parseFloat(c.totalRemaining).toFixed(2) : "0.00",
      creditQty: c ? parseInt(c.totalQty) : 0,
      openCredits: c ? parseInt(c.pendingCount) : 0,
    };
  });

  res.json(result);
});

// GET /api/app-wallets/:productId — detail (topup history + credit list)
router.get("/app-wallets/:productId", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId!, 10);
  if (!productId) { res.status(400).json({ error: "Invalid productId" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (!ownsRow(req, product.businessId)) { res.status(404).json({ error: "Product not found" }); return; }

  const tDollar = tenantWhere(req, dollarWalletTable.businessId);
  const tCredits = tenantWhere(req, appCoinCreditsTable.businessId);
  const tSales = tenantWhere(req, salesTable.businessId);

  const topups = await db.select().from(dollarWalletTable)
    .where(and(eq(dollarWalletTable.entryType, "topup"), eq(dollarWalletTable.productId, productId), tDollar))
    .orderBy(desc(dollarWalletTable.createdAt))
    .limit(100);

  // Current SALE rate of USD = most recent "received" entry rate (across all
  // products — USD sale rate is global, not per-product).
  const lastReceived = await db.select({ rate: dollarWalletTable.rate })
    .from(dollarWalletTable)
    .where(and(eq(dollarWalletTable.entryType, "received"), tDollar))
    .orderBy(desc(dollarWalletTable.createdAt))
    .limit(1);
  const currentDollarSaleRate = lastReceived.length > 0
    ? parseFloat(lastReceived[0]!.rate)
    : 0;

  const credits = await db.select().from(appCoinCreditsTable)
    .where(and(eq(appCoinCreditsTable.productId, productId), tCredits))
    .orderBy(desc(appCoinCreditsTable.createdAt))
    .limit(200);

  const sales = await db
    .select({
      id: salesTable.id,
      invoiceNo: salesTable.invoiceNo,
      createdAt: salesTable.createdAt,
      total: salesTable.total,
      paymentMethod: salesTable.paymentMethod,
      qty: saleItemsTable.qty,
      unitPrice: saleItemsTable.unitPrice,
    })
    .from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(eq(saleItemsTable.productId, productId), eq(salesTable.status, "completed"), tSales))
    .orderBy(desc(salesTable.createdAt))
    .limit(100);

  res.json({
    product,
    topups: topups.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })),
    credits: credits.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
    sales: sales.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    currentDollarSaleRate: currentDollarSaleRate.toFixed(4),
  });
});

// GET /api/app-wallets/credits/:creditId — credit detail with payments
router.get("/app-wallets/credits/:creditId", requireAuth, async (req, res): Promise<void> => {
  const creditId = parseInt(req.params.creditId!, 10);
  const [credit] = await db.select().from(appCoinCreditsTable).where(eq(appCoinCreditsTable.id, creditId));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }
  if (!ownsRow(req, credit.businessId)) { res.status(404).json({ error: "Credit not found" }); return; }

  const payments = await db.select().from(appCoinCreditPaymentsTable)
    .where(eq(appCoinCreditPaymentsTable.creditId, creditId))
    .orderBy(desc(appCoinCreditPaymentsTable.createdAt));

  res.json({
    credit: { ...credit, createdAt: credit.createdAt.toISOString(), updatedAt: credit.updatedAt.toISOString() },
    payments: payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
  });
});

// POST /api/app-wallets/:productId/credits — add new coin credit
router.post("/app-wallets/:productId/credits", requireAuth, async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId!, 10);
  const { customerId, customerName, qty, unitPricePkr, notes, date, dueDate } = req.body as {
    customerId?: number; customerName?: string; qty?: number;
    unitPricePkr?: string; notes?: string | null; date?: string; dueDate?: string | null;
  };

  if (!customerName || !qty || !unitPricePkr || !date) {
    res.status(400).json({ error: "customerName, qty, unitPricePkr, date required" });
    return;
  }
  if (qty <= 0 || parseFloat(unitPricePkr) <= 0) {
    res.status(400).json({ error: "qty and unitPricePkr must be positive" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  if (!ownsRow(req, product.businessId)) { res.status(404).json({ error: "Product not found" }); return; }

  const totalPkr = qty * parseFloat(unitPricePkr);

  const [row] = await db.insert(appCoinCreditsTable).values({
    productId,
    customerId: customerId ?? null,
    customerName,
    qty,
    unitPricePkr: fmt(parseFloat(unitPricePkr)),
    totalPkr: fmt(totalPkr),
    paidPkr: "0.00000000",
    remainingPkr: fmt(totalPkr),
    status: "pending",
    notes: notes ?? null,
    date,
    dueDate: dueDate ?? null,
    userId: String(req.userId),
    businessId: tenantStamp(req),
  }).returning();

  await logAudit(req.userId, "create", "app_coin_credits", row!.id,
    `Credit ${qty} ${product.unit} of ${product.name} to ${customerName} @ ₨${parseFloat(unitPricePkr).toFixed(2)} = ₨${totalPkr.toFixed(2)}`);

  res.status(201).json({ ...row, createdAt: row!.createdAt.toISOString(), updatedAt: row!.updatedAt.toISOString() });
});

// POST /api/app-wallets/credits/:creditId/payment — record a payment
router.post("/app-wallets/credits/:creditId/payment", requireAuth, async (req, res): Promise<void> => {
  const creditId = parseInt(req.params.creditId!, 10);
  const { amountPkr, method, notes, date } = req.body as {
    amountPkr?: string; method?: string; notes?: string | null; date?: string;
  };

  if (!amountPkr || !date) {
    res.status(400).json({ error: "amountPkr and date required" });
    return;
  }
  const amount = parseFloat(amountPkr);
  if (!(amount > 0)) {
    res.status(400).json({ error: "amountPkr must be positive" });
    return;
  }

  const [credit] = await db.select().from(appCoinCreditsTable).where(eq(appCoinCreditsTable.id, creditId));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }
  if (!ownsRow(req, credit.businessId)) { res.status(404).json({ error: "Credit not found" }); return; }

  const remaining = parseFloat(credit.remainingPkr);
  if (amount > remaining + 0.001) {
    res.status(400).json({ error: `Payment ₨${amount.toFixed(2)} exceeds remaining ₨${remaining.toFixed(2)}` });
    return;
  }

  const newPaid = parseFloat(credit.paidPkr) + amount;
  const newRemaining = Math.max(0, remaining - amount);
  const newStatus = newRemaining < 0.01 ? "paid" : amount > 0 ? "partial" : credit.status;

  await db.transaction(async tx => {
    await tx.insert(appCoinCreditPaymentsTable).values({
      creditId,
      amountPkr: fmt(amount),
      method: method ?? "cash",
      notes: notes ?? null,
      date,
      userId: String(req.userId),
      businessId: tenantStamp(req),
    });
    await tx.update(appCoinCreditsTable).set({
      paidPkr: fmt(newPaid),
      remainingPkr: fmt(newRemaining),
      status: newStatus,
    }).where(eq(appCoinCreditsTable.id, creditId));
  });

  await logAudit(req.userId, "update", "app_coin_credits", creditId,
    `Payment ₨${amount.toFixed(2)} via ${method ?? "cash"} — remaining ₨${newRemaining.toFixed(2)}`);

  const [updated] = await db.select().from(appCoinCreditsTable).where(eq(appCoinCreditsTable.id, creditId));
  res.json({ ...updated, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() });
});

// DELETE /api/app-wallets/credits/:creditId
router.delete("/app-wallets/credits/:creditId", requireAuth, async (req, res): Promise<void> => {
  const creditId = parseInt(req.params.creditId!, 10);
  const [credit] = await db.select().from(appCoinCreditsTable).where(eq(appCoinCreditsTable.id, creditId));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }
  if (!ownsRow(req, credit.businessId)) { res.status(404).json({ error: "Credit not found" }); return; }

  await db.delete(appCoinCreditPaymentsTable).where(eq(appCoinCreditPaymentsTable.creditId, creditId));
  await db.delete(appCoinCreditsTable).where(eq(appCoinCreditsTable.id, creditId));

  await logAudit(req.userId, "delete", "app_coin_credits", creditId, `Deleted credit for ${credit.customerName}`);
  res.json({ success: true });
});

export default router;
