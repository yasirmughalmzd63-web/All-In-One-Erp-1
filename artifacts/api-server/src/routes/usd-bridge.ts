import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db, usdPurchasesTable, dollarWalletTable, productsTable,
  accountsTable, creditsTable, customersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isAdmin } from "../lib/permissions.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
const fmt8 = (n: number) => n.toFixed(8);
const fmt2 = (n: number) => n.toFixed(2);

/* ── GET /usd-bridge ── list all USD purchases */
router.get("/usd-bridge", requireAuth, async (req, res): Promise<void> => {
  let rows = await db.select().from(usdPurchasesTable).orderBy(desc(usdPurchasesTable.createdAt));
  if (!isAdmin(req) && req.userLocationId != null)
    rows = rows.filter(r => r.locationId === req.userLocationId);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

/* ── POST /usd-bridge ── buy USD from customer */
router.post("/usd-bridge", requireAuth, async (req, res): Promise<void> => {
  const {
    customerId, customerName,
    dollarAmount, dollarRate,
    // Coins
    coinsPkr, coinsProductId, coinsQty,
    // Cash
    cashPkr, cashAccountId,
    // Credit
    creditPkr,
    notes, date, locationId,
  } = req.body as {
    customerId?: number; customerName: string;
    dollarAmount: string; dollarRate: string;
    coinsPkr?: string; coinsProductId?: number; coinsQty?: string;
    cashPkr?: string; cashAccountId?: number;
    creditPkr?: string;
    notes?: string; date: string; locationId?: number;
  };

  if (!customerName || !dollarAmount || !dollarRate || !date) {
    res.status(400).json({ error: "customerName, dollarAmount, dollarRate, date are required" });
    return;
  }

  const usdAmt  = parseFloat(dollarAmount);
  const rate    = parseFloat(dollarRate);

  if (isNaN(usdAmt) || usdAmt <= 0) {
    res.status(422).json({ error: "Dollar amount must be greater than zero." });
    return;
  }
  if (isNaN(rate) || rate <= 0) {
    res.status(422).json({ error: "Exchange rate must be greater than zero." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    res.status(422).json({ error: `Invalid date "${date}". Use YYYY-MM-DD format.` });
    return;
  }

  const totalPkr = usdAmt * rate;
  const coinsVal = parseFloat(coinsPkr ?? "0");
  const cashVal  = parseFloat(cashPkr ?? "0");
  const creditVal = parseFloat(creditPkr ?? "0");
  const settledPkr = coinsVal + cashVal + creditVal;

  if (settledPkr <= 0) {
    res.status(400).json({ error: "At least one payment method (coins, cash or credit) is required." });
    return;
  }

  const tolerance = 0.01;
  if (Math.abs(settledPkr - totalPkr) > tolerance) {
    res.status(422).json({
      error: `Payment total (₨${settledPkr.toFixed(2)}) does not match the USD value at the given rate (₨${totalPkr.toFixed(2)}). Please reconcile before saving.`,
    });
    return;
  }

  const effectiveLocationId = !isAdmin(req) && req.userLocationId != null
    ? req.userLocationId : (locationId ?? null);

  /* Pre-flight checks outside the transaction so we can return clean errors */
  if (coinsVal > 0 && coinsProductId) {
    const qty = parseFloat(coinsQty ?? "0");
    if (qty <= 0) {
      res.status(422).json({ error: "Coin quantity must be greater than zero." });
      return;
    }
    const [product] = await db.select({ id: productsTable.id, name: productsTable.name, stock: productsTable.stock })
      .from(productsTable).where(eq(productsTable.id, coinsProductId));
    if (!product) {
      res.status(422).json({ error: "Selected coin product does not exist." });
      return;
    }
    if ((product.stock ?? 0) < qty) {
      res.status(422).json({
        error: `Insufficient coin stock for "${product.name}". Available: ${product.stock ?? 0}, Required: ${qty}.`,
      });
      return;
    }
  }

  if (cashVal > 0 && cashAccountId) {
    const [acct] = await db.select().from(accountsTable).where(eq(accountsTable.id, cashAccountId));
    if (!acct) {
      res.status(422).json({ error: "Selected cash account does not exist." });
      return;
    }
    if (!acct.isActive) {
      res.status(422).json({ error: `Account "${acct.name}" is inactive and cannot be used for payments.` });
      return;
    }
    const acctBal = parseFloat(acct.balance);
    if (acctBal < cashVal) {
      res.status(422).json({
        error: `Insufficient funds in "${acct.name}". Available: ₨${acctBal.toFixed(2)}, Required: ₨${cashVal.toFixed(2)}.`,
      });
      return;
    }
  } else if (cashVal > 0 && !cashAccountId) {
    res.status(422).json({ error: "A cash account must be selected when using cash payment." });
    return;
  }

  let coinsProductName: string | null = null;
  let creditId: number | null = null;
  let cashAccountName: string | null = null;

  await db.transaction(async tx => {
    /* 1 ── Dollar wallet: add received USD */
    await tx.insert(dollarWalletTable).values({
      entryType: "purchase",
      amountUsd: fmt8(usdAmt),
      rate: fmt8(rate),
      totalPkr: fmt8(totalPkr),
      partyName: customerName,
      partyType: "customer",
      partyId: customerId ?? null,
      notes: notes ?? null,
      date,
      userId: String(req.userId),
    });

    /* 2 ── Coins: deduct product stock */
    if (coinsVal > 0 && coinsProductId) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, coinsProductId));
      if (!product) throw new Error("Coin product not found");
      coinsProductName = product.name;
      const qty = parseFloat(coinsQty ?? "0");
      const newStock = (product.stock ?? 0) - qty;
      await tx.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, coinsProductId));
    }

    /* 3 ── Cash: deduct from account balance */
    if (cashVal > 0 && cashAccountId) {
      const [acct] = await tx.select().from(accountsTable).where(eq(accountsTable.id, cashAccountId));
      if (!acct) throw new Error("Cash account not found");
      cashAccountName = acct.name;
      const newBal = parseFloat(acct.balance) - cashVal;
      await tx.update(accountsTable).set({ balance: fmt8(newBal) }).where(eq(accountsTable.id, cashAccountId));
    }

    /* 4 ── Credit: create payable (business owes customer) */
    if (creditVal > 0) {
      const partyId = customerId ?? 0;
      // Look for existing open payable credit for this customer
      const existing = await tx.select().from(creditsTable)
        .where(eq(creditsTable.partyId, partyId));
      const openPayable = existing.find(c => c.type === "payable" && c.partyType === "customer" && c.status !== "paid");

      if (openPayable) {
        const newAmt = parseFloat(openPayable.amount) + creditVal;
        const newRemaining = parseFloat(openPayable.remainingAmount) + creditVal;
        const [cr] = await tx.update(creditsTable).set({
          amount: fmt2(newAmt),
          remainingAmount: fmt2(newRemaining),
          status: "pending",
        }).where(eq(creditsTable.id, openPayable.id)).returning();
        creditId = cr!.id;
      } else {
        const [cr] = await tx.insert(creditsTable).values({
          type: "payable",
          partyId,
          partyType: "customer",
          amount: fmt2(creditVal),
          paidAmount: "0.00",
          remainingAmount: fmt2(creditVal),
          status: "pending",
          notes: `USD purchase from ${customerName} on ${date}`,
          userId: req.userId,
        }).returning();
        creditId = cr!.id;
      }
    }

    /* 5 ── Insert usd_purchases record */
    const [row] = await tx.insert(usdPurchasesTable).values({
      customerId: customerId ?? null,
      customerName,
      dollarAmount: fmt2(usdAmt),
      dollarRate: fmt2(rate),
      totalPkr: fmt2(totalPkr),
      coinsPkr: fmt2(coinsVal),
      coinsProductId: coinsProductId ?? null,
      coinsProductName,
      coinsQty: fmt2(parseFloat(coinsQty ?? "0")),
      cashPkr: fmt2(cashVal),
      cashAccountId: cashAccountId ?? null,
      cashAccountName,
      creditPkr: fmt2(creditVal),
      creditId,
      notes: notes ?? null,
      date,
      userId: req.userId,
      locationId: effectiveLocationId,
    }).returning();

    await logAudit(req.userId, "create", "usd_purchase", row!.id, `Bought $${dollarAmount} from ${customerName}`);
    res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
  });
});

/* ── DELETE /usd-bridge/:id ── (admin only, soft reversal info) */
router.delete("/usd-bridge/:id", requireAuth, async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "Admin only" }); return; }
  const id = parseInt(req.params.id!, 10);
  await db.delete(usdPurchasesTable).where(eq(usdPurchasesTable.id, id));
  res.sendStatus(204);
});

/* ── GET /usd-bridge/summary ── totals */
router.get("/usd-bridge/summary", requireAuth, async (req, res): Promise<void> => {
  let rows = await db.select().from(usdPurchasesTable);
  if (!isAdmin(req) && req.userLocationId != null)
    rows = rows.filter(r => r.locationId === req.userLocationId);

  const totalUsd    = rows.reduce((s, r) => s + parseFloat(r.dollarAmount), 0);
  const totalPkr    = rows.reduce((s, r) => s + parseFloat(r.totalPkr), 0);
  const totalCoins  = rows.reduce((s, r) => s + parseFloat(r.coinsPkr), 0);
  const totalCash   = rows.reduce((s, r) => s + parseFloat(r.cashPkr), 0);
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.creditPkr), 0);

  res.json({ totalUsd, totalPkr, totalCoins, totalCash, totalCredit, count: rows.length });
});

export default router;
