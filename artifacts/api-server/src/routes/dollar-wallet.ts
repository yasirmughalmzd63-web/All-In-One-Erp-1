import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, dollarWalletTable, accountsTable, productsTable, walletsTable, suppliersTable, customersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../lib/permissions.js";
import { logAudit } from "../lib/audit.js";
import { tenantWhere, tenantStamp, ownsRow } from "../lib/tenant.js";

const router = Router();

const fmt = (n: number) => n.toFixed(8);

router.get("/dollar-wallet", requireAuth, async (req, res): Promise<void> => {
  const entryType = typeof req.query.entryType === "string" ? req.query.entryType : undefined;
  const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
  const offsetRaw = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : NaN;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 500;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const tenant = tenantWhere(req, dollarWalletTable.businessId);
  const where = and(
    entryType ? eq(dollarWalletTable.entryType, entryType) : undefined,
    tenant,
  );
  const rows = await db.select().from(dollarWalletTable)
    .where(where)
    .orderBy(desc(dollarWalletTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    proofVerifiedAt: r.proofVerifiedAt ? r.proofVerifiedAt.toISOString() : null,
  })));
});

router.get("/dollar-wallet/balance", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, dollarWalletTable.businessId);
  const rows = await db.select().from(dollarWalletTable).where(tenant);
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
    businessId: tenantStamp(req),
  }).returning();
  await logAudit(req.userId, "create", "dollar_wallet", row!.id, `${entryType} ${amountUsd} USD @ ${rate}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.get("/dollar-wallet/wallets", requireAuth, async (req, res): Promise<void> => {
  const tenant = tenantWhere(req, walletsTable.businessId);
  const defaults = [
    { name: "Wise USD", type: "online" },
    { name: "PayPal USD", type: "online" },
    { name: "USDT (Crypto)", type: "crypto" },
    { name: "Cash USD", type: "cash" },
    { name: "Bank USD", type: "bank" },
  ];
  await db.transaction(async tx => {
    const existing = await tx.select().from(walletsTable)
      .where(and(eq(walletsTable.currency, "USD"), tenant));
    const missing = defaults
      .filter(d => !existing.some(w => w.name.toLowerCase() === d.name.toLowerCase()))
      .map(d => ({ ...d, balance: "0.00000000", currency: "USD", businessId: tenantStamp(req) }));
    if (missing.length > 0) {
      await tx.insert(walletsTable).values(missing);
    }
  });
  const all = await db.select().from(walletsTable)
    .where(and(eq(walletsTable.currency, "USD"), tenant))
    .orderBy(walletsTable.id);
  res.json(all);
});

router.post("/dollar-wallet/purchase", requireAuth, async (req, res): Promise<void> => {
  const { amountUsd, rate, accountId, walletId, partyType, partyId, date, notes, paymentProofUrl, paymentProofKey } = req.body as {
    amountUsd?: string; rate?: string; accountId?: number; walletId?: number;
    partyType?: string; partyId?: number; date?: string; notes?: string | null;
    paymentProofUrl?: string | null; paymentProofKey?: string | null;
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
  if (!account) { res.status(404).json({ error: "Account not found." }); return; }
  if (!ownsRow(req, account.businessId)) { res.status(403).json({ error: "Account belongs to another business" }); return; }
  if (!account.isActive) {
    res.status(422).json({ error: `Account "${account.name}" is inactive and cannot be used for USD purchases.` });
    return;
  }
  const acctBal = parseFloat(account.balance);
  if (acctBal < totalPkr) {
    res.status(422).json({
      error: `Insufficient funds in "${account.name}". Available: ₨${acctBal.toFixed(2)}, Required: ₨${totalPkr.toFixed(2)} ($${usd} × ₨${r}).`,
    });
    return;
  }

  const [wallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, walletId), eq(walletsTable.currency, "USD")));
  if (!wallet) { res.status(404).json({ error: "Dollar wallet not found." }); return; }
  if (!ownsRow(req, wallet.businessId)) { res.status(403).json({ error: "Wallet belongs to another business" }); return; }

  let partyName = "";
  if (partyType === "supplier") {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, partyId));
    if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
    if (!ownsRow(req, s.businessId)) { res.status(403).json({ error: "Supplier belongs to another business" }); return; }
    partyName = s.name;
  } else {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, partyId));
    if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
    if (!ownsRow(req, c.businessId)) { res.status(403).json({ error: "Customer belongs to another business" }); return; }
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
      paymentProofUrl: paymentProofUrl ?? null,
      paymentProofKey: paymentProofKey ?? null,
      businessId: tenantStamp(req),
    }).returning();
    return r!;
  });
  await logAudit(req.userId, "create", "dollar_wallet", row.id,
    `Purchase ${amountUsd} USD @ ${rate} from ${partyType} ${partyName} → ${wallet.name}, paid via ${account.name}${paymentProofUrl ? " [proof attached]" : ""}`);
  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    proofVerifiedAt: row.proofVerifiedAt ? row.proofVerifiedAt.toISOString() : null,
    walletName: wallet.name,
    accountName: account.name,
  });
});

// POST /dollar-wallet/:id/verify-proof — mark a purchase's payment screenshot as verified (admin only)
router.post("/dollar-wallet/:id/verify-proof", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const idParam = req.params.id;
  const id = parseInt(typeof idParam === "string" ? idParam : "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  if (!existing) { res.status(404).json({ error: "Entry not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(403).json({ error: "Entry belongs to another business" }); return; }
  if (!existing.paymentProofUrl) { res.status(422).json({ error: "No payment proof attached to this entry" }); return; }

  const [updated] = await db.update(dollarWalletTable)
    .set({ proofVerifiedAt: new Date(), proofVerifiedBy: parseInt(String(req.userId), 10) || 0 })
    .where(eq(dollarWalletTable.id, id))
    .returning();
  await logAudit(req.userId, "update", "dollar_wallet", id, `Verified payment proof for entry #${id}`);
  res.json({
    ...updated!,
    createdAt: updated!.createdAt.toISOString(),
    proofVerifiedAt: updated!.proofVerifiedAt ? updated!.proofVerifiedAt.toISOString() : null,
  });
});

// POST /dollar-wallet/:id/unverify-proof — undo a verification (admin only)
router.post("/dollar-wallet/:id/unverify-proof", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const idParam = req.params.id;
  const id = parseInt(typeof idParam === "string" ? idParam : "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [pre] = await db.select({ businessId: dollarWalletTable.businessId }).from(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  if (!pre) { res.status(404).json({ error: "Entry not found" }); return; }
  if (!ownsRow(req, pre.businessId)) { res.status(403).json({ error: "Entry belongs to another business" }); return; }
  const [updated] = await db.update(dollarWalletTable)
    .set({ proofVerifiedAt: null, proofVerifiedBy: null })
    .where(eq(dollarWalletTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Entry not found" }); return; }
  await logAudit(req.userId, "update", "dollar_wallet", id, `Cleared payment proof verification for entry #${id}`);
  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    proofVerifiedAt: null,
  });
});

router.post("/dollar-wallet/topup", requireAuth, async (req, res): Promise<void> => {
  const {
    productId, walletId, partyType, partyId, amountUsd, perCoinUsdRate, coinsPerUsd,
    exchangeRatePkr, costPricePkr, salePricePkr, wholesalePricePkr, date, notes,
  } = req.body as {
    productId?: number; walletId?: number | null; partyType?: "supplier" | "customer"; partyId?: number;
    amountUsd?: string; perCoinUsdRate?: string; coinsPerUsd?: string;
    exchangeRatePkr?: string; costPricePkr?: string | null; salePricePkr?: string | null; wholesalePricePkr?: string | null;
    date?: string; notes?: string | null;
  };

  // walletId is now OPTIONAL — omit it for a direct/cash purchase (inventory updated, no wallet deducted)
  const useWallet = !!walletId;

  if (!productId || !amountUsd || (!perCoinUsdRate && !coinsPerUsd) || !exchangeRatePkr || !date) {
    res.status(400).json({ error: "productId, amountUsd, perCoinUsdRate or coinsPerUsd, exchangeRatePkr, date required" });
    return;
  }
  if (!partyType || !partyId || (partyType !== "supplier" && partyType !== "customer")) {
    res.status(400).json({ error: "partyType (supplier|customer) and partyId are required" });
    return;
  }

  // Only look up wallet when one was given
  let wallet: typeof walletsTable.$inferSelect | null = null;
  if (useWallet) {
    const [w] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, walletId!), eq(walletsTable.currency, "USD")));
    if (!w) { res.status(404).json({ error: "Dollar wallet not found" }); return; }
    if (!ownsRow(req, w.businessId)) { res.status(403).json({ error: "Wallet belongs to another business" }); return; }
    wallet = w;
  }

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

  if (useWallet && wallet && parseFloat(wallet.balance) < usd) {
    res.status(400).json({ error: `Insufficient balance in ${wallet.name} (have $${wallet.balance}, need $${usd})` });
    return;
  }

  const totalPkr = usd * fx;
  const newCostPerCoin = totalPkr / qty;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Coin product not found" }); return; }
  if (!ownsRow(req, product.businessId)) { res.status(403).json({ error: "Product belongs to another business" }); return; }

  let partyName = "";
  if (partyType === "supplier") {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, partyId));
    if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
    if (!ownsRow(req, s.businessId)) { res.status(403).json({ error: "Supplier belongs to another business" }); return; }
    partyName = s.name;
  } else {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, partyId));
    if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
    if (!ownsRow(req, c.businessId)) { res.status(403).json({ error: "Customer belongs to another business" }); return; }
    partyName = c.name;
  }

  const oldStock = product.stock ?? 0;
  const oldCost = parseFloat(product.costPrice || "0");
  const newStock = oldStock + qty;
  const weightedCost = newStock > 0 ? (oldStock * oldCost + qty * newCostPerCoin) / newStock : newCostPerCoin;

  const overrideCost = costPricePkr && parseFloat(costPricePkr) > 0 ? parseFloat(costPricePkr) : null;
  const finalCostPerCoin = overrideCost ?? weightedCost;
  const productUpdates: Record<string, string | number> = {
    stock: newStock,
    costPrice: fmt(finalCostPerCoin),
  };
  if (salePricePkr && parseFloat(salePricePkr) > 0) productUpdates.unitPrice = fmt(parseFloat(salePricePkr));
  if (wholesalePricePkr && parseFloat(wholesalePricePkr) > 0) productUpdates.wholesalePrice = fmt(parseFloat(wholesalePricePkr));

  const paymentMode = useWallet ? "wallet" : "direct";
  const walletLabel = wallet ? wallet.name : "Direct/Cash";
  const noteText = notes
    ? `${notes} · ${qty} ${product.unit} @ ${perCoin.toFixed(8)} USD/coin via ${walletLabel}`
    : `${qty} ${product.unit} from ${partyType} ${partyName} @ ${perCoin.toFixed(8)} USD/coin via ${walletLabel}`;

  let row: typeof dollarWalletTable.$inferSelect;
  try {
    row = await db.transaction(async tx => {
      await tx.update(productsTable).set(productUpdates).where(eq(productsTable.id, productId));

      if (useWallet && wallet) {
        const [freshWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.id, wallet.id));
        if (!freshWallet || parseFloat(freshWallet.balance) < usd) {
          throw new Error(`Insufficient balance in ${wallet.name} (have $${freshWallet?.balance ?? 0}, need $${usd})`);
        }
        await tx.update(walletsTable).set({ balance: fmt(parseFloat(freshWallet.balance) - usd) }).where(eq(walletsTable.id, wallet.id));
      }

      const [r] = await tx.insert(dollarWalletTable).values({
        entryType: "topup",
        amountUsd: fmt(usd),
        rate: fmt(fx),
        totalPkr: fmt(totalPkr),
        partyName: `${partyName} → ${product.name}`,
        walletId: walletId ?? null,
        partyType,
        partyId,
        productId,
        qty,
        paymentMode,
        notes: noteText,
        date,
        userId: String(req.userId),
        businessId: tenantStamp(req),
      }).returning();
      return r!;
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Topup failed" });
    return;
  }

  await logAudit(req.userId, "create", "dollar_wallet", row.id,
    `Topup ${qty} ${product.name} for ${amountUsd} USD @ $${perCoinUsdRate}/coin (fx ${exchangeRatePkr}) via ${paymentMode}`);

  res.status(201).json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    qty,
    newStock,
    newCostPerCoin: fmt(newCostPerCoin),
  });
});

// POST /api/dollar-wallet/topup/split — atomic split topup across multiple products
router.post("/dollar-wallet/topup/split", requireAuth, async (req, res): Promise<void> => {
  const { walletId, paymentMode, partyType, partyId, date, notes, splits } = req.body as {
    walletId?: number | null;
    paymentMode?: "wallet" | "direct";
    partyType?: "supplier" | "customer";
    partyId?: number;
    date?: string;
    notes?: string | null;
    splits?: Array<{
      productId: number;
      amountUsd: string;
      coinsPerUsd: string;
      exchangeRatePkr: string;
    }>;
  };

  if (!splits || splits.length < 1) {
    res.status(400).json({ error: "At least one split is required" });
    return;
  }
  if (!partyType || !partyId || (partyType !== "supplier" && partyType !== "customer")) {
    res.status(400).json({ error: "partyType (supplier|customer) and partyId are required" });
    return;
  }
  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }

  const useWallet = paymentMode !== "direct" && !!walletId;

  // Validate each split
  for (const s of splits) {
    if (!s.productId || !s.amountUsd || !s.coinsPerUsd || !s.exchangeRatePkr) {
      res.status(400).json({ error: "Each split needs productId, amountUsd, coinsPerUsd, exchangeRatePkr" });
      return;
    }
    if (!(parseFloat(s.amountUsd) > 0) || !(parseFloat(s.coinsPerUsd) > 0) || !(parseFloat(s.exchangeRatePkr) > 0)) {
      res.status(400).json({ error: "amountUsd, coinsPerUsd, exchangeRatePkr must all be positive in every split" });
      return;
    }
  }

  const totalUsd = splits.reduce((sum, s) => sum + parseFloat(s.amountUsd), 0);

  // Look up party
  let partyName = "";
  if (partyType === "supplier") {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, partyId));
    if (!s) { res.status(404).json({ error: "Supplier not found" }); return; }
    if (!ownsRow(req, s.businessId)) { res.status(403).json({ error: "Supplier belongs to another business" }); return; }
    partyName = s.name;
  } else {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, partyId));
    if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
    if (!ownsRow(req, c.businessId)) { res.status(403).json({ error: "Customer belongs to another business" }); return; }
    partyName = c.name;
  }

  // Look up wallet if needed
  let wallet: typeof walletsTable.$inferSelect | null = null;
  if (useWallet) {
    const [w] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, walletId!), eq(walletsTable.currency, "USD")));
    if (!w) { res.status(404).json({ error: "Dollar wallet not found" }); return; }
    if (!ownsRow(req, w.businessId)) { res.status(403).json({ error: "Wallet belongs to another business" }); return; }
    if (parseFloat(w.balance) < totalUsd) {
      res.status(400).json({ error: `Insufficient balance in ${w.name} — have $${parseFloat(w.balance).toFixed(2)}, need $${totalUsd.toFixed(2)} across ${splits.length} splits` });
      return;
    }
    wallet = w;
  }

  // Pre-load all products (scoped to current business)
  const productIds = [...new Set(splits.map(s => s.productId))];
  const products = await db.select().from(productsTable)
    .where(and(inArray(productsTable.id, productIds), tenantWhere(req, productsTable.businessId)));
  const productMap = new Map(products.map(p => [p.id, p]));

  for (const s of splits) {
    if (!productMap.has(s.productId)) {
      res.status(404).json({ error: `Product ${s.productId} not found` });
      return;
    }
  }

  const modeLabel = wallet ? wallet.name : "Direct/Cash";

  // Execute everything in a single DB transaction
  const results: Array<{ productId: number; productName: string; qty: number; newStock: number; ledgerId: number }> = [];
  try {
    await db.transaction(async tx => {
      // Re-check wallet balance inside transaction
      if (useWallet && wallet) {
        const [freshWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.id, wallet.id));
        if (!freshWallet || parseFloat(freshWallet.balance) < totalUsd) {
          throw new Error(`Insufficient balance in ${wallet.name} (have $${freshWallet?.balance ?? 0}, need $${totalUsd.toFixed(2)})`);
        }
        await tx.update(walletsTable)
          .set({ balance: fmt(parseFloat(freshWallet.balance) - totalUsd) })
          .where(eq(walletsTable.id, wallet.id));
      }

      for (const s of splits) {
        const product = productMap.get(s.productId)!;
        const usd = parseFloat(s.amountUsd);
        const fx = parseFloat(s.exchangeRatePkr);
        const cpu = parseFloat(s.coinsPerUsd);
        const qty = Math.floor(usd * cpu);
        const totalPkr = usd * fx;
        const newCostPerCoin = totalPkr / qty;

        if (qty <= 0) throw new Error(`Computed qty is zero for ${product.name} — increase USD or lower per-coin rate`);

        const oldStock = product.stock ?? 0;
        const oldCost = parseFloat(product.costPrice || "0");
        const newStock = oldStock + qty;
        const weightedCost = newStock > 0 ? (oldStock * oldCost + qty * newCostPerCoin) / newStock : newCostPerCoin;

        await tx.update(productsTable).set({
          stock: newStock,
          costPrice: fmt(weightedCost),
        }).where(eq(productsTable.id, s.productId));

        const noteText = notes
          ? `${notes} · ${qty} ${product.unit} @ ₨${(1 / cpu).toFixed(8)} USD/coin via ${modeLabel}`
          : `Split: ${qty} ${product.unit} from ${partyType} ${partyName} @ ₨${(1 / cpu).toFixed(8)} USD/coin via ${modeLabel}`;

        const [row] = await tx.insert(dollarWalletTable).values({
          entryType: "topup",
          amountUsd: fmt(usd),
          rate: fmt(fx),
          totalPkr: fmt(totalPkr),
          partyName: `${partyName} → ${product.name}`,
          walletId: wallet?.id ?? null,
          partyType,
          partyId,
          productId: s.productId,
          qty,
          paymentMode: wallet ? "wallet" : "direct",
          notes: noteText,
          date,
          userId: String(req.userId),
          businessId: tenantStamp(req),
        }).returning();

        results.push({ productId: s.productId, productName: product.name, qty, newStock, ledgerId: row!.id });
      }
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Split topup failed" });
    return;
  }

  await logAudit(req.userId, "create", "dollar_wallet", 0,
    `Split topup: $${totalUsd.toFixed(2)} across ${splits.length} apps from ${partyType} ${partyName} via ${modeLabel}`);

  res.status(201).json({
    totalUsd: fmt(totalUsd),
    splits: results,
    paymentMode: wallet ? "wallet" : "direct",
    walletName: wallet?.name ?? null,
    partyName,
  });
});

// POST /api/dollar-wallet/wallets/transfer — move USD between wallets
router.post("/dollar-wallet/wallets/transfer", requireAuth, async (req, res): Promise<void> => {
  const { fromWalletId, toWalletId, amountUsd, notes, date } = req.body as {
    fromWalletId?: number; toWalletId?: number; amountUsd?: string; notes?: string | null; date?: string;
  };

  if (!fromWalletId || !toWalletId || !amountUsd || !date) {
    res.status(400).json({ error: "fromWalletId, toWalletId, amountUsd, date are required." });
    return;
  }
  if (fromWalletId === toWalletId) {
    res.status(422).json({ error: "Source and destination wallets must be different." });
    return;
  }
  const usd = parseFloat(amountUsd);
  if (isNaN(usd) || usd <= 0) {
    res.status(422).json({ error: "Transfer amount must be greater than zero." });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    res.status(422).json({ error: `Invalid date "${date}". Use YYYY-MM-DD format.` });
    return;
  }

  const [fromWallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, fromWalletId), eq(walletsTable.currency, "USD")));
  if (!fromWallet) { res.status(404).json({ error: "Source wallet not found." }); return; }
  if (!ownsRow(req, fromWallet.businessId)) { res.status(403).json({ error: "Source wallet belongs to another business" }); return; }
  if (!fromWallet.isActive) { res.status(422).json({ error: `Source wallet "${fromWallet.name}" is inactive.` }); return; }

  const [toWallet] = await db.select().from(walletsTable).where(and(eq(walletsTable.id, toWalletId), eq(walletsTable.currency, "USD")));
  if (!toWallet) { res.status(404).json({ error: "Destination wallet not found." }); return; }
  if (!ownsRow(req, toWallet.businessId)) { res.status(403).json({ error: "Destination wallet belongs to another business" }); return; }
  if (!toWallet.isActive) { res.status(422).json({ error: `Destination wallet "${toWallet.name}" is inactive.` }); return; }

  const fromBal = parseFloat(fromWallet.balance);
  if (fromBal < usd) {
    res.status(422).json({
      error: `Insufficient balance in "${fromWallet.name}". Available: $${fromBal.toFixed(2)}, Required: $${usd.toFixed(2)}.`,
    });
    return;
  }

  const result = await db.transaction(async tx => {
    const [freshFrom] = await tx.select().from(walletsTable).where(eq(walletsTable.id, fromWalletId));
    if (!freshFrom || parseFloat(freshFrom.balance) < usd) {
      throw new Error(`Insufficient balance in "${fromWallet.name}" (race condition).`);
    }

    // Deduct from source
    await tx.update(walletsTable)
      .set({ balance: fmt(parseFloat(freshFrom.balance) - usd) })
      .where(eq(walletsTable.id, fromWalletId));

    // Add to destination
    const [freshTo] = await tx.select().from(walletsTable).where(eq(walletsTable.id, toWalletId));
    await tx.update(walletsTable)
      .set({ balance: fmt(parseFloat(freshTo!.balance) + usd) })
      .where(eq(walletsTable.id, toWalletId));

    // Log transfer_out
    const [outRow] = await tx.insert(dollarWalletTable).values({
      entryType: "transfer_out",
      amountUsd: fmt(usd),
      rate: "0.00000000",
      totalPkr: "0.00000000",
      partyName: `→ ${toWallet.name}`,
      partyType: "wallet",
      walletId: fromWalletId,
      notes: notes ?? null,
      date,
      userId: String(req.userId),
      businessId: tenantStamp(req),
    }).returning();

    // Log transfer_in
    const [inRow] = await tx.insert(dollarWalletTable).values({
      entryType: "transfer_in",
      amountUsd: fmt(usd),
      rate: "0.00000000",
      totalPkr: "0.00000000",
      partyName: `← ${fromWallet.name}`,
      partyType: "wallet",
      walletId: toWalletId,
      notes: notes ?? null,
      date,
      userId: String(req.userId),
      businessId: tenantStamp(req),
    }).returning();

    return { outRow: outRow!, inRow: inRow! };
  });

  await logAudit(req.userId, "transfer", "dollar_wallet", result.outRow.id,
    `Transferred $${usd.toFixed(2)} from "${fromWallet.name}" to "${toWallet.name}"`);

  res.status(201).json({
    message: `Successfully transferred $${usd.toFixed(2)} from "${fromWallet.name}" to "${toWallet.name}".`,
    fromBalance: fmt(parseFloat(fromWallet.balance) - usd),
    toBalance:   fmt(parseFloat(toWallet.balance)   + usd),
    outEntry: { ...result.outRow, createdAt: result.outRow.createdAt.toISOString() },
    inEntry:  { ...result.inRow,  createdAt: result.inRow.createdAt.toISOString()  },
  });
});

// GET /api/dollar-wallet/wallets/:id/verify — reconcile stored vs computed balance
router.get("/dollar-wallet/wallets/:id/verify", requireAuth, async (req, res): Promise<void> => {
  const walletId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  if (isNaN(walletId)) { res.status(400).json({ error: "Invalid wallet id." }); return; }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
  if (!wallet) { res.status(404).json({ error: "Wallet not found." }); return; }
  if (!ownsRow(req, wallet.businessId)) { res.status(404).json({ error: "Wallet not found." }); return; }

  const txs = await db.select().from(dollarWalletTable).where(eq(dollarWalletTable.walletId, walletId));

  const IN_TYPES  = new Set(["purchase", "transfer_in"]);
  const OUT_TYPES = new Set(["topup", "transfer_out"]);

  let calculatedBalance = 0;
  let totalIn  = 0;
  let totalOut = 0;

  for (const t of txs) {
    const amt = parseFloat(t.amountUsd);
    if (IN_TYPES.has(t.entryType)) {
      calculatedBalance += amt;
      totalIn += amt;
    } else if (OUT_TYPES.has(t.entryType)) {
      calculatedBalance -= amt;
      totalOut += amt;
    }
  }

  const storedBalance = parseFloat(wallet.balance);
  const discrepancy   = storedBalance - calculatedBalance;
  const isReconciled  = Math.abs(discrepancy) < 0.000001;

  res.json({
    walletId,
    walletName:         wallet.name,
    storedBalance:      fmt(storedBalance),
    calculatedBalance:  fmt(calculatedBalance),
    discrepancy:        fmt(discrepancy),
    isReconciled,
    totalIn:            fmt(totalIn),
    totalOut:           fmt(totalOut),
    txCount:            txs.length,
  });
});

// GET /api/dollar-wallet/wallets/:id/transactions — per-wallet history + summary
router.get("/dollar-wallet/wallets/:id/transactions", requireAuth, async (req, res): Promise<void> => {
  const walletId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  if (isNaN(walletId)) { res.status(400).json({ error: "Invalid wallet id" }); return; }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  if (!ownsRow(req, wallet.businessId)) { res.status(404).json({ error: "Wallet not found" }); return; }

  const txs = await db.select().from(dollarWalletTable)
    .where(eq(dollarWalletTable.walletId, walletId))
    .orderBy(desc(dollarWalletTable.createdAt));

  const IN_TYPES  = new Set(["purchase", "transfer_in"]);
  const OUT_TYPES = new Set(["topup", "transfer_out"]);

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
    transactions: txs.map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      proofVerifiedAt: t.proofVerifiedAt ? t.proofVerifiedAt.toISOString() : null,
    })),
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

// GET /api/dollar-wallet/wallets/:id/summary
// Detailed view for one dollar wallet — summary stats, breakdown by entry type
// and by month, plus the full transaction ledger (newest first).
router.get("/dollar-wallet/wallets/:id/summary", requireAuth, async (req, res): Promise<void> => {
  const walletId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  if (isNaN(walletId)) { res.status(400).json({ error: "Invalid wallet id" }); return; }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.id, walletId));
  if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
  if (!ownsRow(req, wallet.businessId)) { res.status(404).json({ error: "Wallet not found" }); return; }

  const txs = await db.select().from(dollarWalletTable)
    .where(eq(dollarWalletTable.walletId, walletId))
    .orderBy(desc(dollarWalletTable.createdAt));

  // Direction map: which entry types are inflows vs outflows for this wallet
  const IN_TYPES  = new Set(["received", "purchase", "transfer_in"]);
  const OUT_TYPES = new Set(["product",  "topup",    "transfer_out"]);

  const ENTRY_LABELS: Record<string, { label: string; direction: "in" | "out" | "neutral" }> = {
    received:     { label: "Received USD",  direction: "in"  },
    purchase:     { label: "Bought USD",    direction: "in"  },
    transfer_in:  { label: "Transfer In",   direction: "in"  },
    product:      { label: "Sent Product",  direction: "out" },
    topup:        { label: "Coin Top-up",   direction: "out" },
    transfer_out: { label: "Transfer Out",  direction: "out" },
  };

  let totalIn = 0, totalOut = 0, totalInPkr = 0, totalOutPkr = 0;
  const monthMap: Record<string, { in: number; out: number; inPkr: number; outPkr: number; count: number }> = {};
  const typeMap: Record<string, { count: number; totalUsd: number; totalPkr: number }> = {};

  for (const t of txs) {
    const amt = parseFloat(t.amountUsd);
    const pkr = parseFloat(t.totalPkr);
    const monthKey = t.date.slice(0, 7);

    if (!monthMap[monthKey]) monthMap[monthKey] = { in: 0, out: 0, inPkr: 0, outPkr: 0, count: 0 };
    monthMap[monthKey]!.count += 1;

    if (!typeMap[t.entryType]) typeMap[t.entryType] = { count: 0, totalUsd: 0, totalPkr: 0 };
    typeMap[t.entryType]!.count    += 1;
    typeMap[t.entryType]!.totalUsd += amt;
    typeMap[t.entryType]!.totalPkr += pkr;

    if (IN_TYPES.has(t.entryType)) {
      totalIn += amt; totalInPkr += pkr;
      monthMap[monthKey]!.in += amt; monthMap[monthKey]!.inPkr += pkr;
    } else if (OUT_TYPES.has(t.entryType)) {
      totalOut += amt; totalOutPkr += pkr;
      monthMap[monthKey]!.out += amt; monthMap[monthKey]!.outPkr += pkr;
    }
  }

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v, in: +v.in.toFixed(2), out: +v.out.toFixed(2), inPkr: +v.inPkr.toFixed(2), outPkr: +v.outPkr.toFixed(2) }));

  const byEntryType = Object.entries(typeMap)
    .sort(([, a], [, b]) => b.totalUsd - a.totalUsd)
    .map(([entryType, v]) => ({
      entryType,
      label: ENTRY_LABELS[entryType]?.label ?? entryType,
      direction: ENTRY_LABELS[entryType]?.direction ?? "neutral",
      count: v.count,
      totalUsd: fmt(v.totalUsd),
      totalPkr: fmt(v.totalPkr),
    }));

  res.json({
    wallet: { ...wallet, createdAt: wallet.createdAt.toISOString() },
    summary: {
      currentBalance: wallet.balance,
      totalIn:    fmt(totalIn),
      totalOut:   fmt(totalOut),
      totalInPkr: fmt(totalInPkr),
      totalOutPkr:fmt(totalOutPkr),
      netUsd:     fmt(totalIn - totalOut),
      txCount:    txs.length,
    },
    byEntryType,
    monthly,
    transactions: txs.map(t => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      proofVerifiedAt: t.proofVerifiedAt ? t.proofVerifiedAt.toISOString() : null,
    })),
  });
});

router.delete("/dollar-wallet/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select().from(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!ownsRow(req, existing.businessId)) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(dollarWalletTable).where(eq(dollarWalletTable.id, id));
  await logAudit(req.userId, "delete", "dollar_wallet", id);
  res.sendStatus(204);
});

export default router;
