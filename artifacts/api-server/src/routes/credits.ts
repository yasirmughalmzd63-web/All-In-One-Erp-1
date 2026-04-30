import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, creditsTable, creditPaymentsTable, customersTable, suppliersTable, accountsTable, productsTable, dollarWalletTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";
import { canModify, isAdmin } from "../lib/permissions.js";

const router = Router();

async function getPartyInfo(partyId: number, partyType: string): Promise<{ name: string; locationId: number | null }> {
  if (partyType === "customer") {
    const [c] = await db.select({ name: customersTable.name, locationId: customersTable.locationId }).from(customersTable).where(eq(customersTable.id, partyId));
    return { name: c?.name ?? "Unknown", locationId: c?.locationId ?? null };
  } else {
    const [s] = await db.select({ name: suppliersTable.name, locationId: suppliersTable.locationId }).from(suppliersTable).where(eq(suppliersTable.id, partyId));
    return { name: s?.name ?? "Unknown", locationId: s?.locationId ?? null };
  }
}

router.get("/credits", requireAuth, async (req, res): Promise<void> => {
  let rows;
  if (!isAdmin(req) && req.userLocationId != null) {
    const locationId = req.userLocationId;
    const [customers, suppliers] = await Promise.all([
      db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.locationId, locationId)),
      db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.locationId, locationId)),
    ]);
    const customerIds = customers.map(c => c.id);
    const supplierIds = suppliers.map(s => s.id);
    const allCredits = await db.select().from(creditsTable).orderBy(desc(creditsTable.createdAt));
    rows = allCredits.filter(r =>
      (r.partyType === "customer" && customerIds.includes(r.partyId)) ||
      (r.partyType === "supplier" && supplierIds.includes(r.partyId))
    );
  } else {
    rows = await db.select().from(creditsTable).orderBy(desc(creditsTable.createdAt));
  }
  const result = await Promise.all(rows.map(async (row) => {
    const info = await getPartyInfo(row.partyId, row.partyType);
    return { ...row, partyName: info.name, locationId: info.locationId, createdAt: row.createdAt.toISOString() };
  }));
  res.json(result);
});

// Individual credit payment history
router.get("/credits/:id/payments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const payments = await db.select().from(creditPaymentsTable).where(eq(creditPaymentsTable.creditId, id)).orderBy(desc(creditPaymentsTable.createdAt));
  res.json(payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

// Report endpoint: filter by date, location, user
router.get("/credits/report", requireAuth, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, locationId, userId } = req.query as {
    dateFrom?: string; dateTo?: string; locationId?: string; userId?: string;
  };

  let creditRows = await db.select().from(creditsTable).orderBy(desc(creditsTable.createdAt));

  // Location filter — resolve via customer/supplier
  if (locationId) {
    const locId = parseInt(locationId);
    const [customers, suppliers] = await Promise.all([
      db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.locationId, locId)),
      db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.locationId, locId)),
    ]);
    const customerIds = customers.map(c => c.id);
    const supplierIds = suppliers.map(s => s.id);
    creditRows = creditRows.filter(r =>
      (r.partyType === "customer" && customerIds.includes(r.partyId)) ||
      (r.partyType === "supplier" && supplierIds.includes(r.partyId))
    );
  }

  if (userId) {
    creditRows = creditRows.filter(r => r.userId === parseInt(userId));
  }

  // Date filter on createdAt
  const fromDate = dateFrom ? new Date(dateFrom) : null;
  const toDate = dateTo ? new Date(dateTo + "T23:59:59Z") : null;
  if (fromDate) creditRows = creditRows.filter(r => r.createdAt >= fromDate);
  if (toDate) creditRows = creditRows.filter(r => r.createdAt <= toDate);

  const creditIds = creditRows.map(r => r.id);

  let paymentRows = creditIds.length > 0
    ? await db.select().from(creditPaymentsTable).orderBy(desc(creditPaymentsTable.createdAt))
    : [];
  paymentRows = paymentRows.filter(p => creditIds.includes(p.creditId));

  // Enrich credits with party info
  const enriched = await Promise.all(creditRows.map(async r => {
    const info = await getPartyInfo(r.partyId, r.partyType);
    return { ...r, partyName: info.name, locationId: info.locationId, createdAt: r.createdAt.toISOString() };
  }));

  // Summary
  const totalOutstanding = creditRows.filter(r => r.status !== "paid").reduce((s, r) => s + parseFloat(r.remainingAmount), 0);
  const totalCollected = creditRows.reduce((s, r) => s + parseFloat(r.paidAmount), 0);
  const cashPayments = paymentRows.filter(p => p.paymentMethod === "account").reduce((s, p) => s + parseFloat(p.amount), 0);
  const dollarPayments = paymentRows.filter(p => p.paymentMethod === "dollar");
  const dollarTotalUsd = dollarPayments.reduce((s, p) => s + parseFloat(p.dollarAmount ?? "0"), 0);
  const dollarTotalPkr = dollarPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const coinsPayments = paymentRows.filter(p => p.paymentMethod === "coins_withdraw");
  const coinsTotalQty = coinsPayments.reduce((s, p) => s + parseFloat(p.productQty ?? "0"), 0);
  const coinsTotalPkr = coinsPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

  // Opening: credits created before fromDate that still had balance
  const openingTotal = fromDate
    ? creditRows.filter(r => r.createdAt < fromDate).reduce((s, r) => s + parseFloat(r.amount), 0)
    : 0;
  const closingTotal = totalOutstanding;

  res.json({
    summary: {
      totalCredits: creditRows.length,
      totalOutstanding,
      totalCollected,
      cashPayments,
      dollarTotalUsd,
      dollarTotalPkr,
      coinsTotalQty,
      coinsTotalPkr,
      openingTotal,
      closingTotal,
    },
    credits: enriched,
    payments: paymentRows.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
  });
});

router.post("/credits", requireAuth, async (req, res): Promise<void> => {
  const { type, partyId, partyType, amount, dueDate, notes, userId } = req.body as {
    type: string; partyId: number; partyType: string; amount: string;
    dueDate?: string | null; notes?: string | null; userId: number;
  };
  if (!type || !partyId || !partyType || !amount || !userId) { res.status(400).json({ error: "type, partyId, partyType, amount, userId required" }); return; }
  const [row] = await db.insert(creditsTable).values({
    type, partyId, partyType, amount, paidAmount: "0.00000000", remainingAmount: amount,
    dueDate: dueDate ?? null, notes: notes ?? null, userId, status: "pending",
  }).returning();
  const info = await getPartyInfo(partyId, partyType);
  await logAudit(req.userId, "create", "credit", row!.id);
  res.status(201).json({ ...row!, partyName: info.name, locationId: info.locationId, createdAt: row!.createdAt.toISOString() });
});

router.post("/credits/:id/pay", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const {
    payAmount, accountId,
    paymentMethod = "account",
    dollarAmount, dollarRate,
    productId, productQty, productName, productValuePkr,
    notes,
  } = req.body as {
    payAmount: string; accountId?: number | null;
    paymentMethod?: "account" | "dollar" | "coins_withdraw";
    dollarAmount?: string; dollarRate?: string;
    productId?: number; productQty?: string; productName?: string; productValuePkr?: string;
    notes?: string;
  };

  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, id));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }

  const paid = parseFloat(payAmount);
  if (isNaN(paid) || paid <= 0) { res.status(400).json({ error: "Invalid payAmount" }); return; }
  if (paid > parseFloat(credit.remainingAmount) + 0.001) {
    res.status(400).json({ error: "Amount exceeds remaining balance" }); return;
  }

  const newPaid = parseFloat(credit.paidAmount) + paid;
  const newRemaining = parseFloat(credit.amount) - newPaid;
  const status = newRemaining <= 0.001 ? "paid" : "partial";

  const [updated] = await db.update(creditsTable).set({
    paidAmount: newPaid.toFixed(8),
    remainingAmount: Math.max(0, newRemaining).toFixed(8),
    status,
  }).where(eq(creditsTable.id, id)).returning();

  // Account balance update
  if (paymentMethod === "account" && accountId) {
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (account) {
      const direction = credit.type === "receivable" ? 1 : -1;
      const newBal = parseFloat(account.balance) + direction * paid;
      await db.update(accountsTable).set({ balance: newBal.toFixed(8) }).where(eq(accountsTable.id, accountId));
    }
  }

  // Dollar payment — add to dollar wallet
  if (paymentMethod === "dollar" && dollarAmount && dollarRate) {
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(dollarWalletTable).values({
      entryType: "received",
      amountUsd: parseFloat(dollarAmount).toFixed(8),
      rate: parseFloat(dollarRate).toFixed(8),
      totalPkr: paid.toFixed(8),
      partyType: credit.partyType,
      partyId: credit.partyId,
      notes: `Credit payment #${id}`,
      date: today,
      userId: String(req.userId),
    });
  }

  // Coins/product withdrawal — deduct from stock
  if (paymentMethod === "coins_withdraw" && productId && productQty) {
    const qty = parseFloat(productQty);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (product) {
      const newStock = Math.max(0, (product.stock ?? 0) - Math.floor(qty));
      await db.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, productId));
    }
  }

  // Log payment record
  const info = await getPartyInfo(credit.partyId, credit.partyType);
  const [payRec] = await db.insert(creditPaymentsTable).values({
    creditId: id,
    amount: paid.toFixed(8),
    paymentMethod,
    accountId: paymentMethod === "account" ? (accountId ?? null) : null,
    dollarAmount: dollarAmount ? parseFloat(dollarAmount).toFixed(8) : null,
    dollarRate: dollarRate ? parseFloat(dollarRate).toFixed(8) : null,
    productId: productId ?? null,
    productName: productName ?? null,
    productQty: productQty ? parseFloat(productQty).toFixed(8) : null,
    productValuePkr: productValuePkr ? parseFloat(productValuePkr).toFixed(8) : null,
    notes: notes ?? null,
    userId: req.userId!,
    locationId: info.locationId,
  }).returning();

  await logAudit(req.userId, "payment", "credit", id, `${paymentMethod} ₨${paid.toFixed(2)}${dollarAmount ? ` ($${dollarAmount})` : ""}${productName ? ` via ${productName}` : ""}`);
  res.json({
    credit: { ...updated!, partyName: info.name, locationId: info.locationId, createdAt: updated!.createdAt.toISOString() },
    payment: { ...payRec!, createdAt: payRec!.createdAt.toISOString() },
  });
});

// POST /api/credits/:id/pay/multi — settle a credit with multiple payment methods atomically
router.post("/credits/:id/pay/multi", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const { notes, legs } = req.body as {
    notes?: string;
    legs?: Array<{
      paymentMethod: "account" | "dollar" | "coins_withdraw";
      amount: string;
      accountId?: number | null;
      dollarAmount?: string;
      dollarRate?: string;
      productId?: number;
      productQty?: string;
      productName?: string;
      productValuePkr?: string;
    }>;
  };

  if (!legs || legs.length === 0) { res.status(400).json({ error: "At least one payment leg is required" }); return; }

  const [credit] = await db.select().from(creditsTable).where(eq(creditsTable.id, id));
  if (!credit) { res.status(404).json({ error: "Credit not found" }); return; }
  if (credit.status === "paid") { res.status(400).json({ error: "Credit is already fully paid" }); return; }

  // Validate + compute each leg's PKR amount
  const legAmounts: number[] = [];
  for (const leg of legs) {
    const amt = parseFloat(leg.amount);
    if (isNaN(amt) || amt <= 0) {
      res.status(400).json({ error: `Each leg must have a positive amount. Got: ${leg.amount}` }); return;
    }
    if (leg.paymentMethod === "dollar" && (!leg.dollarAmount || !leg.dollarRate)) {
      res.status(400).json({ error: "Dollar legs require dollarAmount and dollarRate" }); return;
    }
    if (leg.paymentMethod === "coins_withdraw" && (!leg.productId || !leg.productQty)) {
      res.status(400).json({ error: "Coins withdraw legs require productId and productQty" }); return;
    }
    legAmounts.push(amt);
  }

  const totalPaid = legAmounts.reduce((s, a) => s + a, 0);
  const remaining = parseFloat(credit.remainingAmount);
  if (totalPaid > remaining + 0.01) {
    res.status(400).json({ error: `Total payment ₨${totalPaid.toFixed(2)} exceeds remaining balance ₨${remaining.toFixed(2)}` }); return;
  }

  const newPaid = parseFloat(credit.paidAmount) + totalPaid;
  const newRemaining = Math.max(0, parseFloat(credit.amount) - newPaid);
  const status = newRemaining <= 0.001 ? "paid" : "partial";
  const info = await getPartyInfo(credit.partyId, credit.partyType);

  const payments: (typeof creditPaymentsTable.$inferSelect)[] = [];
  try {
    await db.transaction(async tx => {
      // Update credit
      await tx.update(creditsTable).set({
        paidAmount: newPaid.toFixed(8),
        remainingAmount: newRemaining.toFixed(8),
        status,
      }).where(eq(creditsTable.id, id));

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i]!;
        const amt = legAmounts[i]!;
        const today = new Date().toISOString().slice(0, 10);

        if (leg.paymentMethod === "account" && leg.accountId) {
          const [account] = await tx.select().from(accountsTable).where(eq(accountsTable.id, leg.accountId));
          if (account) {
            const direction = credit.type === "receivable" ? 1 : -1;
            const newBal = parseFloat(account.balance) + direction * amt;
            await tx.update(accountsTable).set({ balance: newBal.toFixed(8) }).where(eq(accountsTable.id, leg.accountId));
          }
        }

        if (leg.paymentMethod === "dollar" && leg.dollarAmount && leg.dollarRate) {
          await tx.insert(dollarWalletTable).values({
            entryType: "received",
            amountUsd: parseFloat(leg.dollarAmount).toFixed(8),
            rate: parseFloat(leg.dollarRate).toFixed(8),
            totalPkr: amt.toFixed(8),
            partyType: credit.partyType,
            partyId: credit.partyId,
            notes: `Multi-pay credit #${id} leg ${i + 1}${notes ? ` · ${notes}` : ""}`,
            date: today,
            userId: String(req.userId),
          });
        }

        if (leg.paymentMethod === "coins_withdraw" && leg.productId && leg.productQty) {
          const qty = Math.floor(parseFloat(leg.productQty));
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, leg.productId));
          if (product) {
            const newStock = Math.max(0, (product.stock ?? 0) - qty);
            await tx.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, leg.productId));
          }
        }

        const [payRec] = await tx.insert(creditPaymentsTable).values({
          creditId: id,
          amount: amt.toFixed(8),
          paymentMethod: leg.paymentMethod,
          accountId: leg.paymentMethod === "account" ? (leg.accountId ?? null) : null,
          dollarAmount: leg.dollarAmount ? parseFloat(leg.dollarAmount).toFixed(8) : null,
          dollarRate: leg.dollarRate ? parseFloat(leg.dollarRate).toFixed(8) : null,
          productId: leg.productId ?? null,
          productName: leg.productName ?? null,
          productQty: leg.productQty ? parseFloat(leg.productQty).toFixed(8) : null,
          productValuePkr: leg.productValuePkr ? parseFloat(leg.productValuePkr).toFixed(8) : null,
          notes: notes ?? null,
          userId: req.userId!,
          locationId: info.locationId,
        }).returning();
        payments.push(payRec!);
      }
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Multi-payment failed" }); return;
  }

  await logAudit(req.userId, "payment", "credit", id,
    `Multi-pay ₨${totalPaid.toFixed(2)} across ${legs.length} methods (${legs.map(l => l.paymentMethod).join(", ")})`);

  const [updated] = await db.select().from(creditsTable).where(eq(creditsTable.id, id));
  res.json({
    credit: { ...updated!, partyName: info.name, locationId: info.locationId, createdAt: updated!.createdAt.toISOString() },
    payments: payments.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })),
    totalPaid: totalPaid.toFixed(2),
    legsCount: legs.length,
  });
});

router.delete("/credits/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({ userId: creditsTable.userId }).from(creditsTable).where(eq(creditsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Credit not found" }); return; }
  if (!canModify(req, res, existing.userId)) return;
  await db.delete(creditPaymentsTable).where(eq(creditPaymentsTable.creditId, id));
  await db.delete(creditsTable).where(eq(creditsTable.id, id));
  await logAudit(req.userId, "delete", "credit", id);
  res.sendStatus(204);
});

export default router;
