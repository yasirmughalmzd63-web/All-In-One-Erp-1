import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, dollarWalletTable, accountsTable, productsTable, walletsTable, suppliersTable, customersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

const fmt = (n: number) => n.toFixed(8);

router.get("/dollar-wallet", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(dollarWalletTable).orderBy(desc(dollarWalletTable.createdAt));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.get("/dollar-wallet/balance", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(dollarWalletTable);
  const SIGN: Record<string, 1 | -1> = {
    received: 1, partial: 1, recovery: 1, purchase: 1,
    product: -1, topup: -1,
  };
  let balanceUsd = 0;
  let lastRate = 0;
  let lastRateAt = 0;
  for (const r of rows) {
    const sign = SIGN[r.entryType] ?? 1;
    balanceUsd += sign * parseFloat(r.amountUsd);
    const t = r.createdAt.getTime();
    if (t > lastRateAt && parseFloat(r.rate) > 0) { lastRate = parseFloat(r.rate); lastRateAt = t; }
  }
  res.json({ balanceUsd: fmt(balanceUsd), lastRate: fmt(lastRate) });
});

router.post("/dollar-wallet", requireAuth, async (req, res): Promise<void> => {
  const { entryType, amountUsd, rate, totalPkr, partyName, notes, date } = req.body as {
    entryType?: string; amountUsd?: string; rate?: string; totalPkr?: string;
    partyName?: string | null; notes?: string | null; date?: string;
  };
  if (!amountUsd || !rate || !totalPkr || !date) {
    res.status(400).json({ error: "amountUsd, rate, totalPkr, date required" });
    return;
  }
  const [row] = await db.insert(dollarWalletTable).values({
    entryType: entryType ?? "received",
    amountUsd: fmt(parseFloat(amountUsd)),
    rate: fmt(parseFloat(rate)),
    totalPkr: fmt(parseFloat(totalPkr)),
    partyName: partyName ?? null,
    notes: notes ?? null,
    date,
    userId: String(req.userId),
  }).returning();
  await logAudit(req.userId, "create", "dollar_wallet", row!.id, `${entryType} ${amountUsd} USD @ ${rate}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.get("/dollar-wallet/wallets", requireAuth, async (_req, res): Promise<void> => {
  const defaults = [
    { name: "Wise USD", type: "online" },
    { name: "PayPal USD", type: "online" },
    { name: "USDT (Crypto)", type: "crypto" },
    { name: "Cash USD", type: "cash" },
    { name: "Bank USD", type: "bank" },
  ];
  await db.transaction(async tx => {
    const existing = await tx.select().from(walletsTable).where(eq(walletsTable.currency, "USD"));
    const missing = defaults
      .filter(d => !existing.some(w => w.name.toLowerCase() === d.name.toLowerCase()))
      .map(d => ({ ...d, balance: "0.00000000", currency: "USD" }));
    if (missing.length > 0) {
      await tx.insert(walletsTable).values(missing);
    }
  });
  const all = await db.select().from(walletsTable).where(eq(walletsTable.currency, "USD")).orderBy(walletsTable.id);
  res.json(all);
});

router.post("/dollar-wallet/purchase", requireAuth, async (req, res): Promise<void> => {
  const { amountUsd, rate, accountId, walletId, partyType, partyId, date, notes } = req.body as {
    amountUsd?: string; rate?: string; accountId?: number; walletId?: number;
    partyType?: string; partyId?: number; date?: string; notes?: string | null;
  };
  if (!amountUsd || !rate || !accountId || !walletId || !partyType || !partyId || !date) {
    res.status(400).json({ error: "amountUsd, rate, accountId, walletId, partyType, partyId, date required" });
    return;
  }
  if (partyType !== "supplier" && partyType !== "customer") {
    res.status(400).json({ error: "partyType must be 'supplier' or 'customer'" });
    return;
  }
  const usd = parseFloat(amountUsd);
  const r = parseFloat(rate);
  if (!(usd > 0) || !(r > 0)) {
    res.status(400).json({ error: "amountUsd and rate must be positive" });
    return;
  }
  const totalPkr = usd * r;

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const [wallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, walletId), eq(walletsTable.currency, "USD")));
  if (!wallet) { res.status(404).json({ error: "Dollar wallet not found" }); return; }

  let partyName = "";
  if (partyType === "supplier") {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, partyId));
    if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
    partyName = s.name;
  } else {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, partyId));
    if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
    partyName = c.name;
  }

  const row = await db.transaction(async tx => {
    const newAcctBal = parseFloat(account.balance) - totalPkr;
    await tx.update(accountsTable).set({ balance: fmt(newAcctBal) }).where(eq(accountsTable.id, accountId));

    const newWalletBal = parseFloat(wallet.balance) + usd;
    await tx.update(walletsTable).set({ balance: fmt(newWalletBal) }).where(eq(walletsTable.id, walletId));

    const [r] = await tx.insert(dollarWalletTable).values({
      entryType: "purchase",
      amountUsd: fmt(usd),
      rate: fmt(parseFloat(rate)),
      totalPkr: fmt(totalPkr),
      partyName,
      partyType,
      partyId,
      walletId,
      accountId,
      notes: notes ?? null,
      date,
      userId: String(req.userId),
    }).returning();
    return r!;
  });
  await logAudit(req.userId, "create", "dollar_wallet", row.id,
    `Purchase ${amountUsd} USD @ ${rate} from ${partyType} ${partyName} → ${wallet.name}, paid via ${account.name}`);
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), walletName: wallet.name, accountName: account.name });
});

router.post("/dollar-wallet/topup", requireAuth, async (req, res): Promise<void> => {
  const { productId, walletId, partyType, partyId, amountUsd, perCoinUsdRate, coinsPerUsd, exchangeRatePkr, costPricePkr, salePricePkr, wholesalePricePkr, date, notes } = req.body as {
    productId?: number; walletId?: number; partyType?: "supplier" | "customer"; partyId?: number;
    amountUsd?: string; perCoinUsdRate?: string; coinsPerUsd?: string;
    exchangeRatePkr?: string; costPricePkr?: string | null; salePricePkr?: string | null; wholesalePricePkr?: string | null;
    date?: string; notes?: string | null;
  };
  if (!productId || !walletId || !amountUsd || (!perCoinUsdRate && !coinsPerUsd) || !exchangeRatePkr || !date) {
    res.status(400).json({ error: "productId, walletId, amountUsd, perCoinUsdRate or coinsPerUsd, exchangeRatePkr, date required" });
    return;
  }
  if (!partyType || !partyId || (partyType !== "supplier" && partyType !== "customer")) {
    res.status(400).json({ error: "partyType (supplier|customer) and partyId are required" });
    return;
  }
  const [wallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, walletId), eq(walletsTable.currency, "USD")));
  if (!wallet) { res.status(404).json({ error: "Dollar wallet not found" }); return; }
  const usd = parseFloat(amountUsd);
  const fx = parseFloat(exchangeRatePkr);
  let qty = 0;
  let perCoin = 0;
  if (coinsPerUsd && parseFloat(coinsPerUsd) > 0) {
    const cpu = parseFloat(coinsPerUsd);
    qty = Math.floor(usd * cpu);
    perCoin = 1 / cpu;
  } else {
    perCoin = parseFloat(perCoinUsdRate!);
    qty = Math.floor(usd / perCoin);
  }
  if (!(usd > 0) || !(perCoin > 0) || !(fx > 0)) {
    res.status(400).json({ error: "amountUsd, rate and exchangeRatePkr must be positive" });
    return;
  }
  if (qty <= 0) { res.status(400).json({ error: "Computed coin quantity is zero — increase USD or lower per-coin rate" }); return; }
  const totalPkr = usd * fx;
  const newCostPerCoin = totalPkr / qty;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Coin product not found" }); return; }

  let partyName = "";
  if (partyType === "supplier") {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, partyId));
    if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
    partyName = s.name;
  } else {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, partyId));
    if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
    partyName = c.name;
  }

  const oldStock = product.stock ?? 0;
  const oldCost = parseFloat(product.costPrice || "0");
  const newStock = oldStock + qty;
  const weightedCost = newStock > 0 ? (oldStock * oldCost + qty * newCostPerCoin) / newStock : newCostPerCoin;

  const overrideCost = costPricePkr && parseFloat(costPricePkr) > 0 ? parseFloat(costPricePkr) : null;
  const finalCostPerCoin = overrideCost ?? weightedCost;
  const updates: Record<string, string | number> = {
    stock: newStock,
    costPrice: fmt(finalCostPerCoin),
  };
  if (salePricePkr && parseFloat(salePricePkr) > 0) {
    updates.unitPrice = fmt(parseFloat(salePricePkr));
  }
  if (wholesalePricePkr && parseFloat(wholesalePricePkr) > 0) {
    updates.wholesalePrice = fmt(parseFloat(wholesalePricePkr));
  }

  if (parseFloat(wallet.balance) < usd) {
    res.status(400).json({ error: `Insufficient balance in ${wallet.name} (have $${wallet.balance}, need $${usd})` });
    return;
  }

  let row: typeof dollarWalletTable.$inferSelect;
  try {
    row = await db.transaction(async tx => {
      const [freshWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.id, walletId));
      if (!freshWallet || parseFloat(freshWallet.balance) < usd) {
        throw new Error(`Insufficient balance in ${wallet.name} (have $${freshWallet?.balance ?? 0}, need $${usd})`);
      }
      await tx.update(productsTable).set(updates).where(eq(productsTable.id, productId));
      const newWalletBal = parseFloat(freshWallet.balance) - usd;
      await tx.update(walletsTable).set({ balance: fmt(newWalletBal) }).where(eq(walletsTable.id, walletId));
      const [r] = await tx.insert(dollarWalletTable).values({
        entryType: "topup",
        amountUsd: fmt(usd),
        rate: fmt(fx),
        totalPkr: fmt(totalPkr),
        partyName: `${partyName} → ${product.name}`,
        walletId,
        partyType,
        partyId,
        notes: notes ? `${notes} · ${qty} ${product.unit} from ${partyType} ${partyName} @ ${perCoin.toFixed(8)} USD/coin · paid from ${wallet.name}` : `${qty} ${product.unit} from ${partyType} ${partyName} @ ${perCoin.toFixed(8)} USD/coin · paid from ${wallet.name}`,
        date,
        userId: String(req.userId),
      }).returning();
      return r!;
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Topup failed" });
    return;
  }

  await logAudit(req.userId, "create", "dollar_wallet", row.id,
    `Topup ${qty} ${product.name} for ${amountUsd} USD @ $${perCoinUsdRate}/coin (fx ${exchangeRatePkr})`);

  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    qty,
    newStock,
    newCostPerCoin: fmt(newCostPerCoin),
  });
});

// GET /api/dollar-wallet/wallets/:id/transactions — per-wallet history + summary
router.get("/dollar-wallet/wallets/:id/transactions", requireAuth, async (req, res): Promise<void> => {
  const walletId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  if (isNaN(walletId)) { res.status(400).json({ error: "Invalid wallet id" }); return; }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }

  const txs = await db.select().from(dollarWalletTable)
    .where(eq(dollarWalletTable.walletId, walletId))
    .orderBy(desc(dollarWalletTable.createdAt));

  const IN_TYPES = new Set(["purchase"]);
  const OUT_TYPES = new Set(["topup"]);

  let totalIn = 0;
  let totalOut = 0;
  let totalInPkr = 0;
  let totalOutPkr = 0;
  const monthMap: Record<string, { in: number; out: number; inPkr: number; outPkr: number; count: number }> = {};

  for (const t of txs) {
    const amt = parseFloat(t.amountUsd);
    const pkr = parseFloat(t.totalPkr);
    const monthKey = t.date.slice(0, 7);
    if (!monthMap[monthKey]) monthMap[monthKey] = { in: 0, out: 0, inPkr: 0, outPkr: 0, count: 0 };
    monthMap[monthKey]!.count += 1;
    if (IN_TYPES.has(t.entryType)) {
      totalIn += amt;
      totalInPkr += pkr;
      monthMap[monthKey]!.in += amt;
      monthMap[monthKey]!.inPkr += pkr;
    } else if (OUT_TYPES.has(t.entryType)) {
      totalOut += amt;
      totalOutPkr += pkr;
      monthMap[monthKey]!.out += amt;
      monthMap[monthKey]!.outPkr += pkr;
    }
  }

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v }));

  res.json({
    wallet: { ...wallet, createdAt: wallet.createdAt.toISOString() },
    transactions: txs.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })),
    summary: {
      totalIn: fmt(totalIn),
      totalOut: fmt(totalOut),
      totalInPkr: fmt(totalInPkr),
      totalOutPkr: fmt(totalOutPkr),
      netUsd: fmt(totalIn - totalOut),
      txCount: txs.length,
    },
    monthly,
  });
});

router.delete("/dollar-wallet/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select().from(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  await logAudit(req.userId, "delete", "dollar_wallet", id);
  res.sendStatus(204);
});

export default router;
