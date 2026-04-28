import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, dollarWalletTable, accountsTable, productsTable } from "@workspace/db";
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

router.post("/dollar-wallet/purchase", requireAuth, async (req, res): Promise<void> => {
  const { amountUsd, rate, accountId, date, notes } = req.body as {
    amountUsd?: string; rate?: string; accountId?: number; date?: string; notes?: string | null;
  };
  if (!amountUsd || !rate || !accountId || !date) {
    res.status(400).json({ error: "amountUsd, rate, accountId, date required" });
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
  const newBal = parseFloat(account.balance) - totalPkr;
  await db.update(accountsTable).set({ balance: fmt(newBal) }).where(eq(accountsTable.id, accountId));

  const [row] = await db.insert(dollarWalletTable).values({
    entryType: "purchase",
    amountUsd: fmt(usd),
    rate: fmt(r),
    totalPkr: fmt(totalPkr),
    partyName: account.name,
    notes: notes ?? null,
    date,
    userId: String(req.userId),
  }).returning();
  await logAudit(req.userId, "create", "dollar_wallet", row!.id, `Purchase ${amountUsd} USD @ ${rate} from ${account.name}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.post("/dollar-wallet/topup", requireAuth, async (req, res): Promise<void> => {
  const { productId, amountUsd, perCoinUsdRate, exchangeRatePkr, date, notes } = req.body as {
    productId?: number; amountUsd?: string; perCoinUsdRate?: string;
    exchangeRatePkr?: string; date?: string; notes?: string | null;
  };
  if (!productId || !amountUsd || !perCoinUsdRate || !exchangeRatePkr || !date) {
    res.status(400).json({ error: "productId, amountUsd, perCoinUsdRate, exchangeRatePkr, date required" });
    return;
  }
  const usd = parseFloat(amountUsd);
  const perCoin = parseFloat(perCoinUsdRate);
  const fx = parseFloat(exchangeRatePkr);
  if (!(usd > 0) || !(perCoin > 0) || !(fx > 0)) {
    res.status(400).json({ error: "amountUsd, perCoinUsdRate and exchangeRatePkr must be positive" });
    return;
  }
  const qty = Math.floor(usd / perCoin);
  if (qty <= 0) { res.status(400).json({ error: "Computed coin quantity is zero — increase USD or lower per-coin rate" }); return; }
  const totalPkr = usd * fx;
  const newCostPerCoin = totalPkr / qty;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Coin product not found" }); return; }

  const oldStock = product.stock ?? 0;
  const oldCost = parseFloat(product.costPrice || "0");
  const newStock = oldStock + qty;
  const weightedCost = newStock > 0 ? (oldStock * oldCost + qty * newCostPerCoin) / newStock : newCostPerCoin;

  await db.update(productsTable)
    .set({ stock: newStock, costPrice: fmt(weightedCost) })
    .where(eq(productsTable.id, productId));

  const [row] = await db.insert(dollarWalletTable).values({
    entryType: "topup",
    amountUsd: fmt(usd),
    rate: fmt(fx),
    totalPkr: fmt(totalPkr),
    partyName: product.name,
    notes: notes ? `${notes} · ${qty} ${product.unit} @ $${perCoinUsdRate}/coin` : `${qty} ${product.unit} @ $${perCoinUsdRate}/coin`,
    date,
    userId: String(req.userId),
  }).returning();

  await logAudit(req.userId, "create", "dollar_wallet", row!.id,
    `Topup ${qty} ${product.name} for ${amountUsd} USD @ $${perCoinUsdRate}/coin (fx ${exchangeRatePkr})`);

  res.status(201).json({
    ...row!,
    createdAt: row!.createdAt.toISOString(),
    qty,
    newStock,
    newCostPerCoin: fmt(newCostPerCoin),
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
