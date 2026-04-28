import { Router } from "express";
import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import {
  db, locationsTable, accountsTable, productsTable,
  creditsTable, salesTable, saleItemsTable, purchasesTable, purchaseItemsTable,
  expensesTable, usersTable, auditLogsTable, stockTransfersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();
const EXCHANGE_RATE = 285;

// ─── helpers shared by financial reports ───────────────────────────────────
function parseDateRange(req: { query: Record<string, unknown> }): { start: Date; end: Date; allTime: boolean } {
  const startStr = typeof req.query.startDate === "string" ? req.query.startDate : null;
  const endStr   = typeof req.query.endDate   === "string" ? req.query.endDate   : null;
  const now = new Date();
  if (!startStr && !endStr) {
    return { start: new Date(0), end: new Date(now.getFullYear() + 100, 0, 1), allTime: true };
  }
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const start = startStr ? new Date(`${startStr}T00:00:00.000`) : todayStart;
  const end   = endStr   ? new Date(`${endStr}T23:59:59.999`)   : todayEnd;
  return { start, end, allTime: false };
}

function readScope(req: { userId?: number | null; userRole?: string | null; userLocationId?: number | null; query: Record<string, unknown> }): {
  isAdmin: boolean; locationId: number | null; userId: number | null;
} | { error: { status: number; body: Record<string, unknown> } } {
  const isAdmin = req.userRole === "admin" || req.userRole === "manager";
  if (!isAdmin && (req.userLocationId === null || req.userLocationId === undefined)) {
    return { error: { status: 403, body: { error: "User has no assigned app/location; report access denied." } } };
  }
  const queryLoc = typeof req.query.locationId === "string" ? parseInt(req.query.locationId as string) : null;
  const locationId = isAdmin ? queryLoc : (req.userLocationId ?? null);
  return { isAdmin, locationId, userId: req.userId ?? null };
}

function localDayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

router.get("/reports/daily-snapshot", requireAuth, async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0]!;

  // ── Locations ─────────────────────────────────────────────────────────────
  const locations = await db.select().from(locationsTable).where(eq(locationsTable.isActive, true));

  // Bank per location
  const bankByLoc = await db.select({
    locationId: accountsTable.locationId,
    total: sql<string>`coalesce(sum(cast(${accountsTable.balance} as numeric)), 0)`,
  }).from(accountsTable).where(eq(accountsTable.isActive, true)).groupBy(accountsTable.locationId);

  // Stock per location
  const stockByLoc = await db.select({
    locationId: productsTable.locationId,
    total: sql<string>`coalesce(sum(cast(${productsTable.costPrice} as numeric) * ${productsTable.stock}), 0)`,
    units: sql<string>`coalesce(sum(${productsTable.stock}), 0)`,
    products: sql<string>`count(*)`,
  }).from(productsTable).where(eq(productsTable.isActive, true)).groupBy(productsTable.locationId);

  // Credits – total receivable remaining (no location on credits, shown at totals level)
  const [creditRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
  }).from(creditsTable).where(eq(creditsTable.type, "receivable"));

  // Unlinked (no location) bank + stock
  const bankMap = new Map(bankByLoc.map(r => [r.locationId ?? -1, parseFloat(r.total)]));
  const stockMap = new Map(stockByLoc.map(r => [r.locationId ?? -1, { value: parseFloat(r.total), units: parseInt(r.units), products: parseInt(r.products) }]));

  const locationData = locations.map(loc => {
    const bank  = bankMap.get(loc.id)  ?? 0;
    const stock = stockMap.get(loc.id) ?? { value: 0, units: 0, products: 0 };
    const total = bank + stock.value;
    return {
      id:         loc.id,
      name:       loc.name,
      address:    loc.address,
      bankPKR:    bank,
      stockPKR:   stock.value,
      stockUnits: stock.units,
      productCount: stock.products,
      totalPKR:   total,
      bankUSD:    bank / EXCHANGE_RATE,
      stockUSD:   stock.value / EXCHANGE_RATE,
      totalUSD:   total / EXCHANGE_RATE,
    };
  });

  // Unlinked totals
  const unlinkedBank  = bankMap.get(-1)  ?? 0;
  const unlinkedStock = stockMap.get(-1) ?? { value: 0, units: 0, products: 0 };

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = await db.select().from(usersTable).where(eq(usersTable.isActive, true));

  // Sales per user (today) — amountPaid = cash collected, credit = total - amountPaid
  const salesToday = await db.select({
    userId: salesTable.userId,
    total:  sql<string>`coalesce(sum(cast(${salesTable.total} as numeric)), 0)`,
    cash:   sql<string>`coalesce(sum(cast(${salesTable.amountPaid} as numeric)), 0)`,
    credit: sql<string>`coalesce(sum(greatest(cast(${salesTable.total} as numeric) - cast(${salesTable.amountPaid} as numeric), 0)), 0)`,
    count:  sql<string>`count(*)`,
  }).from(salesTable).where(sql`date(${salesTable.createdAt}) = ${today}`).groupBy(salesTable.userId);

  // Sales all-time per user
  const salesAll = await db.select({
    userId: salesTable.userId,
    total:  sql<string>`coalesce(sum(cast(${salesTable.total} as numeric)), 0)`,
    cash:   sql<string>`coalesce(sum(cast(${salesTable.amountPaid} as numeric)), 0)`,
    credit: sql<string>`coalesce(sum(greatest(cast(${salesTable.total} as numeric) - cast(${salesTable.amountPaid} as numeric), 0)), 0)`,
    count:  sql<string>`count(*)`,
  }).from(salesTable).groupBy(salesTable.userId);

  const todayMap  = new Map(salesToday.map(r => [r.userId, r]));
  const allMap    = new Map(salesAll.map(r => [r.userId, r]));

  const userData = users.map(u => {
    const t = todayMap.get(u.id);
    const a = allMap.get(u.id);
    return {
      id:           u.id,
      name:         u.name,
      username:     u.username,
      role:         u.role,
      locationId:   u.locationId,
      today: {
        salesCount:  parseInt(t?.count ?? "0"),
        salesTotal:  parseFloat(t?.total ?? "0"),
        cashCollected: parseFloat(t?.cash ?? "0"),
        creditAmount:  parseFloat(t?.credit ?? "0"),
      },
      allTime: {
        salesCount:    parseInt(a?.count ?? "0"),
        salesTotal:    parseFloat(a?.total ?? "0"),
        cashCollected: parseFloat(a?.cash ?? "0"),
        creditAmount:  parseFloat(a?.credit ?? "0"),
      },
    };
  });

  // ── Grand Totals ──────────────────────────────────────────────────────────
  const totalBank  = locationData.reduce((s, l) => s + l.bankPKR,  0) + unlinkedBank;
  const totalStock = locationData.reduce((s, l) => s + l.stockPKR, 0) + unlinkedStock.value;
  const totalCredit = parseFloat(creditRow?.total ?? "0");
  const grandTotal  = totalBank + totalStock + totalCredit;

  res.json({
    generatedAt:  new Date().toISOString(),
    date:         today,
    exchangeRate: EXCHANGE_RATE,
    totals: {
      bankPKR:    totalBank,
      stockPKR:   totalStock,
      creditPKR:  totalCredit,
      grandPKR:   grandTotal,
      bankUSD:    totalBank   / EXCHANGE_RATE,
      stockUSD:   totalStock  / EXCHANGE_RATE,
      creditUSD:  totalCredit / EXCHANGE_RATE,
      grandUSD:   grandTotal  / EXCHANGE_RATE,
      unlinkedBankPKR:  unlinkedBank,
      unlinkedStockPKR: unlinkedStock.value,
      unlinkedStockUnits: unlinkedStock.units,
    },
    locations: locationData,
    users: userData,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFIT & LOSS  GET /api/reports/profit-loss?startDate&endDate&locationId
// Sales − COGS − Expenses = Net Profit
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/profit-loss", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }
  const { start, end, allTime } = parseDateRange(req as never);

  // Sales total + count
  const salesConds = [gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)];
  if (scope.locationId) salesConds.push(eq(salesTable.locationId, scope.locationId));
  const [salesRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${salesTable.total} as numeric)), 0)`,
    count: sql<string>`count(*)`,
    discount: sql<string>`coalesce(sum(cast(${salesTable.discount} as numeric)), 0)`,
    paid: sql<string>`coalesce(sum(cast(${salesTable.amountPaid} as numeric)), 0)`,
  }).from(salesTable).where(and(...salesConds));

  // COGS = sum(saleItems.qty * product.cost_price) — for sales in range, scoped by location
  const cogsRows = await db.select({
    qty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
    cogs: sql<string>`coalesce(sum(${saleItemsTable.qty} * cast(${productsTable.costPrice} as numeric)), 0)`,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .innerJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(and(...salesConds));

  // Purchases (informational)
  const purchaseConds = [gte(purchasesTable.createdAt, start), lte(purchasesTable.createdAt, end)];
  if (scope.locationId) purchaseConds.push(eq(purchasesTable.locationId, scope.locationId));
  const [purRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${purchasesTable.total} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(purchasesTable).where(and(...purchaseConds));

  // Expenses by date (uses expenses.date YYYY-MM-DD)
  const startDay = localDayString(start);
  const endDay   = localDayString(end);
  const expenseConds = allTime ? [] : [gte(expensesTable.date, startDay), lte(expensesTable.date, endDay)];
  const [expRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${expensesTable.amount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(expensesTable).where(expenseConds.length ? and(...expenseConds) : sql`true`);

  // Per-category expense breakdown
  const expByCategory = await db.select({
    categoryId: expensesTable.categoryId,
    title: expensesTable.title,
    total: sql<string>`coalesce(sum(cast(${expensesTable.amount} as numeric)), 0)`,
  }).from(expensesTable).where(expenseConds.length ? and(...expenseConds) : sql`true`).groupBy(expensesTable.categoryId, expensesTable.title);

  const sales    = parseFloat(salesRow?.total ?? "0");
  const cogs     = parseFloat(cogsRows[0]?.cogs ?? "0");
  const expenses = parseFloat(expRow?.total ?? "0");
  const purchase = parseFloat(purRow?.total ?? "0");
  const grossProfit = sales - cogs;
  const netProfit   = grossProfit - expenses;
  const margin = sales > 0 ? (netProfit / sales) * 100 : 0;

  res.json({
    startDate: start.toISOString(), endDate: end.toISOString(), allTime,
    scope,
    sales: {
      total: sales.toFixed(8),
      count: parseInt(salesRow?.count ?? "0"),
      discount: parseFloat(salesRow?.discount ?? "0").toFixed(8),
      collected: parseFloat(salesRow?.paid ?? "0").toFixed(8),
    },
    cogs: { total: cogs.toFixed(8), unitsSold: parseInt(cogsRows[0]?.qty ?? "0") },
    purchases: { total: purchase.toFixed(8), count: parseInt(purRow?.count ?? "0") },
    expenses: {
      total: expenses.toFixed(8),
      count: parseInt(expRow?.count ?? "0"),
      breakdown: expByCategory.map(c => ({
        categoryId: c.categoryId, title: c.title, total: parseFloat(c.total).toFixed(8),
      })).sort((a, b) => parseFloat(b.total) - parseFloat(a.total)),
    },
    grossProfit: grossProfit.toFixed(8),
    netProfit:   netProfit.toFixed(8),
    margin:      margin.toFixed(2),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE SHEET  GET /api/reports/balance-sheet?asOfDate&locationId
// Snapshot: Assets = Liabilities + Equity (Equity is plugged from net = A − L)
// Note: Uses CURRENT account balances and product stock; historical asOfDate
// for receivables/payables uses snapshot of credits.remainingAmount as of now.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/balance-sheet", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }

  // Accounts — buckets by type
  const accConds = [eq(accountsTable.isActive, true)];
  if (scope.locationId) accConds.push(eq(accountsTable.locationId, scope.locationId));
  const accounts = await db.select().from(accountsTable).where(and(...accConds));
  const cash = accounts.filter(a => (a.type ?? "cash") === "cash").reduce((s, a) => s + parseFloat(a.balance), 0);
  const bank = accounts.filter(a => a.type === "bank").reduce((s, a) => s + parseFloat(a.balance), 0);
  const wallet = accounts.filter(a => a.type === "mobile_wallet").reduce((s, a) => s + parseFloat(a.balance), 0);
  const otherAcc = accounts.filter(a => !["cash", "bank", "mobile_wallet"].includes(a.type ?? "cash")).reduce((s, a) => s + parseFloat(a.balance), 0);

  // Inventory at cost
  const prodConds = [eq(productsTable.isActive, true)];
  if (scope.locationId) prodConds.push(eq(productsTable.locationId, scope.locationId));
  const [invRow] = await db.select({
    value: sql<string>`coalesce(sum(${productsTable.stock} * cast(${productsTable.costPrice} as numeric)), 0)`,
    valueAtPrice: sql<string>`coalesce(sum(${productsTable.stock} * cast(${productsTable.unitPrice} as numeric)), 0)`,
    units: sql<string>`coalesce(sum(${productsTable.stock}), 0)`,
  }).from(productsTable).where(and(...prodConds));

  // Receivables / Payables — scope by userId for non-admin (credits.userId = creator)
  const recConds = [eq(creditsTable.type, "receivable")];
  const payConds = [eq(creditsTable.type, "payable")];
  if (!scope.isAdmin && scope.userId) {
    recConds.push(eq(creditsTable.userId, scope.userId));
    payConds.push(eq(creditsTable.userId, scope.userId));
  }
  const [recRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(creditsTable).where(and(...recConds));
  const [payRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(creditsTable).where(and(...payConds));

  const inventoryValue = parseFloat(invRow?.value ?? "0");
  const receivables    = parseFloat(recRow?.total ?? "0");
  const payables       = parseFloat(payRow?.total ?? "0");

  const totalAssets = cash + bank + wallet + otherAcc + inventoryValue + receivables;
  const totalLiabilities = payables;
  const equity = totalAssets - totalLiabilities;

  res.json({
    asOfDate: new Date().toISOString(),
    scope,
    assets: {
      cash:  cash.toFixed(8),
      bank:  bank.toFixed(8),
      mobileWallet: wallet.toFixed(8),
      otherAccounts: otherAcc.toFixed(8),
      inventory: inventoryValue.toFixed(8),
      inventoryAtPrice: parseFloat(invRow?.valueAtPrice ?? "0").toFixed(8),
      inventoryUnits: parseInt(invRow?.units ?? "0"),
      receivables: receivables.toFixed(8),
      receivablesCount: parseInt(recRow?.count ?? "0"),
      total: totalAssets.toFixed(8),
    },
    liabilities: {
      payables: payables.toFixed(8),
      payablesCount: parseInt(payRow?.count ?? "0"),
      loans: "0.00000000",
      total: totalLiabilities.toFixed(8),
    },
    equity: {
      ownerCapitalAndProfit: equity.toFixed(8),
      total: equity.toFixed(8),
    },
    accounts: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })),
    balanceCheck: { liabilitiesPlusEquity: (totalLiabilities + equity).toFixed(8), matches: true },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT-WISE PROFIT  GET /api/reports/product-profit?startDate&endDate&locationId
// Per product: opening / purchased / sold / balance / value / profit
// Profit = sum(saleItems.total) - sum(saleItems.qty * cost_price)  [in range]
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/product-profit", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }
  const { start, end } = parseDateRange(req as never);

  const prodConds = [eq(productsTable.isActive, true)];
  if (scope.locationId) prodConds.push(eq(productsTable.locationId, scope.locationId));
  const products = await db.select({
    id: productsTable.id, name: productsTable.name,
    stock: productsTable.stock, unitPrice: productsTable.unitPrice, costPrice: productsTable.costPrice,
    locationId: productsTable.locationId,
  }).from(productsTable).where(and(...prodConds));
  const productIds = products.map(p => p.id);

  if (productIds.length === 0) { res.json({ rows: [], totals: emptyProductTotals(), scope, startDate: start.toISOString(), endDate: end.toISOString() }); return; }

  const locations = await db.select({ id: locationsTable.id, name: locationsTable.name }).from(locationsTable);
  const locName = new Map(locations.map(l => [l.id, l.name]));

  const inSales = await db.select({
    productId: saleItemsTable.productId,
    qty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
    revenue: sql<string>`coalesce(sum(cast(${saleItemsTable.total} as numeric)), 0)`,
    cogs: sql<string>`coalesce(sum(${saleItemsTable.qty} * cast(${productsTable.costPrice} as numeric)), 0)`,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .innerJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(and(inArray(saleItemsTable.productId, productIds), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end)))
    .groupBy(saleItemsTable.productId);

  const inPur = await db.select({
    productId: purchaseItemsTable.productId,
    qty: sql<string>`coalesce(sum(${purchaseItemsTable.qty}), 0)`,
    cost: sql<string>`coalesce(sum(cast(${purchaseItemsTable.total} as numeric)), 0)`,
  }).from(purchaseItemsTable)
    .innerJoin(purchasesTable, eq(purchaseItemsTable.purchaseId, purchasesTable.id))
    .where(and(inArray(purchaseItemsTable.productId, productIds), gte(purchasesTable.createdAt, start), lte(purchasesTable.createdAt, end)))
    .groupBy(purchaseItemsTable.productId);

  const afterSales = await db.select({
    productId: saleItemsTable.productId, qty: sql<string>`coalesce(sum(${saleItemsTable.qty}), 0)`,
  }).from(saleItemsTable).innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .where(and(inArray(saleItemsTable.productId, productIds), gt(salesTable.createdAt, end)))
    .groupBy(saleItemsTable.productId);

  const afterPur = await db.select({
    productId: purchaseItemsTable.productId, qty: sql<string>`coalesce(sum(${purchaseItemsTable.qty}), 0)`,
  }).from(purchaseItemsTable).innerJoin(purchasesTable, eq(purchaseItemsTable.purchaseId, purchasesTable.id))
    .where(and(inArray(purchaseItemsTable.productId, productIds), gt(purchasesTable.createdAt, end)))
    .groupBy(purchaseItemsTable.productId);

  const sMap = new Map(inSales.map(r => [r.productId, { qty: parseInt(r.qty), revenue: parseFloat(r.revenue), cogs: parseFloat(r.cogs) }]));
  const pMap = new Map(inPur.map(r => [r.productId, { qty: parseInt(r.qty), cost: parseFloat(r.cost) }]));
  const aSMap = new Map(afterSales.map(r => [r.productId, parseInt(r.qty)]));
  const aPMap = new Map(afterPur.map(r => [r.productId, parseInt(r.qty)]));

  const rows = products.map(p => {
    const s = sMap.get(p.id) ?? { qty: 0, revenue: 0, cogs: 0 };
    const pu = pMap.get(p.id) ?? { qty: 0, cost: 0 };
    const balance = (p.stock ?? 0) - (aPMap.get(p.id) ?? 0) + (aSMap.get(p.id) ?? 0);
    const opening = balance - pu.qty + s.qty;
    const profit = s.revenue - s.cogs;
    return {
      productId: p.id, productName: p.name,
      locationId: p.locationId, locationName: p.locationId ? (locName.get(p.locationId) ?? null) : null,
      opening, purchased: pu.qty, purchasedValue: pu.cost.toFixed(8),
      sold: s.qty, revenue: s.revenue.toFixed(8), cogs: s.cogs.toFixed(8),
      balance, balanceValue: (balance * parseFloat(p.costPrice ?? "0")).toFixed(8),
      profit: profit.toFixed(8),
      margin: s.revenue > 0 ? ((profit / s.revenue) * 100).toFixed(2) : "0.00",
    };
  }).sort((a, b) => parseFloat(b.profit) - parseFloat(a.profit));

  const totals = rows.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    purchased: acc.purchased + r.purchased, purchasedValue: acc.purchasedValue + parseFloat(r.purchasedValue),
    sold: acc.sold + r.sold, revenue: acc.revenue + parseFloat(r.revenue), cogs: acc.cogs + parseFloat(r.cogs),
    balance: acc.balance + r.balance, balanceValue: acc.balanceValue + parseFloat(r.balanceValue),
    profit: acc.profit + parseFloat(r.profit),
  }), { opening: 0, purchased: 0, purchasedValue: 0, sold: 0, revenue: 0, cogs: 0, balance: 0, balanceValue: 0, profit: 0 });

  res.json({
    startDate: start.toISOString(), endDate: end.toISOString(),
    scope,
    rows,
    totals: {
      opening: totals.opening, purchased: totals.purchased, purchasedValue: totals.purchasedValue.toFixed(8),
      sold: totals.sold, revenue: totals.revenue.toFixed(8), cogs: totals.cogs.toFixed(8),
      balance: totals.balance, balanceValue: totals.balanceValue.toFixed(8),
      profit: totals.profit.toFixed(8),
      margin: totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : "0.00",
    },
  });
});
function emptyProductTotals() {
  return { opening: 0, purchased: 0, purchasedValue: "0.00000000", sold: 0, revenue: "0.00000000", cogs: "0.00000000",
    balance: 0, balanceValue: "0.00000000", profit: "0.00000000", margin: "0.00" };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION-WISE  GET /api/reports/location-summary?startDate&endDate
// Per location: sales / purchases / stock value / cash balance / profit
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/location-summary", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }
  const { start, end } = parseDateRange(req as never);

  const locWhere = scope.locationId ? eq(locationsTable.id, scope.locationId) : sql`true`;
  const locations = await db.select().from(locationsTable).where(and(eq(locationsTable.isActive, true), locWhere));

  // Aggregations per location
  const salesByLoc = await db.select({
    locationId: salesTable.locationId,
    total: sql<string>`coalesce(sum(cast(${salesTable.total} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(salesTable).where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end))).groupBy(salesTable.locationId);

  const purByLoc = await db.select({
    locationId: purchasesTable.locationId,
    total: sql<string>`coalesce(sum(cast(${purchasesTable.total} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(purchasesTable).where(and(gte(purchasesTable.createdAt, start), lte(purchasesTable.createdAt, end))).groupBy(purchasesTable.locationId);

  // COGS per location
  const cogsByLoc = await db.select({
    locationId: salesTable.locationId,
    cogs: sql<string>`coalesce(sum(${saleItemsTable.qty} * cast(${productsTable.costPrice} as numeric)), 0)`,
  }).from(saleItemsTable)
    .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
    .innerJoin(productsTable, eq(saleItemsTable.productId, productsTable.id))
    .where(and(gte(salesTable.createdAt, start), lte(salesTable.createdAt, end))).groupBy(salesTable.locationId);

  const stockByLoc = await db.select({
    locationId: productsTable.locationId,
    value: sql<string>`coalesce(sum(${productsTable.stock} * cast(${productsTable.costPrice} as numeric)), 0)`,
    units: sql<string>`coalesce(sum(${productsTable.stock}), 0)`,
  }).from(productsTable).where(eq(productsTable.isActive, true)).groupBy(productsTable.locationId);

  const cashByLoc = await db.select({
    locationId: accountsTable.locationId,
    total: sql<string>`coalesce(sum(cast(${accountsTable.balance} as numeric)), 0)`,
  }).from(accountsTable).where(eq(accountsTable.isActive, true)).groupBy(accountsTable.locationId);

  const sMap = new Map(salesByLoc.map(r => [r.locationId ?? -1, { total: parseFloat(r.total), count: parseInt(r.count) }]));
  const pMap = new Map(purByLoc.map(r => [r.locationId ?? -1, { total: parseFloat(r.total), count: parseInt(r.count) }]));
  const cogsMap = new Map(cogsByLoc.map(r => [r.locationId ?? -1, parseFloat(r.cogs)]));
  const stMap = new Map(stockByLoc.map(r => [r.locationId ?? -1, { value: parseFloat(r.value), units: parseInt(r.units) }]));
  const csMap = new Map(cashByLoc.map(r => [r.locationId ?? -1, parseFloat(r.total)]));

  const rows = locations.map(l => {
    const s = sMap.get(l.id) ?? { total: 0, count: 0 };
    const p = pMap.get(l.id) ?? { total: 0, count: 0 };
    const cogs = cogsMap.get(l.id) ?? 0;
    const stock = stMap.get(l.id) ?? { value: 0, units: 0 };
    const cash = csMap.get(l.id) ?? 0;
    return {
      locationId: l.id, locationName: l.name,
      sales: s.total.toFixed(8), salesCount: s.count,
      purchases: p.total.toFixed(8), purchasesCount: p.count,
      cogs: cogs.toFixed(8),
      grossProfit: (s.total - cogs).toFixed(8),
      stockValue: stock.value.toFixed(8), stockUnits: stock.units,
      cashBalance: cash.toFixed(8),
      netWorth: (cash + stock.value).toFixed(8),
    };
  }).sort((a, b) => parseFloat(b.sales) - parseFloat(a.sales));

  const totals = rows.reduce((acc, r) => ({
    sales: acc.sales + parseFloat(r.sales), purchases: acc.purchases + parseFloat(r.purchases),
    cogs: acc.cogs + parseFloat(r.cogs), grossProfit: acc.grossProfit + parseFloat(r.grossProfit),
    stockValue: acc.stockValue + parseFloat(r.stockValue), cashBalance: acc.cashBalance + parseFloat(r.cashBalance),
    netWorth: acc.netWorth + parseFloat(r.netWorth),
  }), { sales: 0, purchases: 0, cogs: 0, grossProfit: 0, stockValue: 0, cashBalance: 0, netWorth: 0 });

  res.json({
    startDate: start.toISOString(), endDate: end.toISOString(), scope,
    rows,
    totals: {
      sales: totals.sales.toFixed(8), purchases: totals.purchases.toFixed(8),
      cogs: totals.cogs.toFixed(8), grossProfit: totals.grossProfit.toFixed(8),
      stockValue: totals.stockValue.toFixed(8), cashBalance: totals.cashBalance.toFixed(8),
      netWorth: totals.netWorth.toFixed(8),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASH FLOW  GET /api/reports/cash-flow?accountId&startDate&endDate
// Movements per account: opening, credits (in), debits (out), closing
// "Credits" = sales.amountPaid where account, "Debits" = expenses.amount + purchases.amountPaid
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/cash-flow", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }
  const { start, end } = parseDateRange(req as never);
  const queryAccId = typeof req.query.accountId === "string" ? parseInt(req.query.accountId) : null;

  const accConds = [eq(accountsTable.isActive, true)];
  if (scope.locationId) accConds.push(eq(accountsTable.locationId, scope.locationId));
  if (queryAccId)       accConds.push(eq(accountsTable.id, queryAccId));
  const accounts = await db.select().from(accountsTable).where(and(...accConds));
  const accountIds = accounts.map(a => a.id);

  if (accountIds.length === 0) { res.json({ rows: [], totals: { credits: "0.00000000", debits: "0.00000000", net: "0.00000000", closing: "0.00000000" }, scope }); return; }

  // Sales-in-range cash IN (amountPaid)
  const salesIn = await db.select({
    accountId: salesTable.accountId,
    total: sql<string>`coalesce(sum(cast(${salesTable.amountPaid} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(salesTable).where(and(inArray(salesTable.accountId, accountIds), gte(salesTable.createdAt, start), lte(salesTable.createdAt, end))).groupBy(salesTable.accountId);

  // Purchases cash OUT
  const pursOut = await db.select({
    accountId: purchasesTable.accountId,
    total: sql<string>`coalesce(sum(cast(${purchasesTable.amountPaid} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(purchasesTable).where(and(inArray(purchasesTable.accountId, accountIds), gte(purchasesTable.createdAt, start), lte(purchasesTable.createdAt, end))).groupBy(purchasesTable.accountId);

  // Expenses cash OUT (date col is text YYYY-MM-DD)
  const startDay = localDayString(start);
  const endDay   = localDayString(end);
  const expOut = await db.select({
    accountId: expensesTable.accountId,
    total: sql<string>`coalesce(sum(cast(${expensesTable.amount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(expensesTable).where(and(inArray(expensesTable.accountId, accountIds), gte(expensesTable.date, startDay), lte(expensesTable.date, endDay))).groupBy(expensesTable.accountId);

  const sMap = new Map(salesIn.map(r => [r.accountId ?? -1, { total: parseFloat(r.total), count: parseInt(r.count) }]));
  const pMap = new Map(pursOut.map(r => [r.accountId ?? -1, { total: parseFloat(r.total), count: parseInt(r.count) }]));
  const eMap = new Map(expOut.map(r => [r.accountId ?? -1, { total: parseFloat(r.total), count: parseInt(r.count) }]));

  const rows = accounts.map(a => {
    const credIn = sMap.get(a.id) ?? { total: 0, count: 0 };
    const debOutP = pMap.get(a.id) ?? { total: 0, count: 0 };
    const debOutE = eMap.get(a.id) ?? { total: 0, count: 0 };
    const credits = credIn.total;
    const debits  = debOutP.total + debOutE.total;
    const closing = parseFloat(a.balance);   // current balance is closing
    const opening = closing - credits + debits;
    return {
      accountId: a.id, accountName: a.name, accountType: a.type, currency: a.currency,
      opening: opening.toFixed(8),
      credits: credits.toFixed(8), creditsCount: credIn.count,
      debitsPurchases: debOutP.total.toFixed(8), debitsExpenses: debOutE.total.toFixed(8),
      debits: debits.toFixed(8), debitsCount: debOutP.count + debOutE.count,
      net: (credits - debits).toFixed(8),
      closing: closing.toFixed(8),
    };
  }).sort((a, b) => parseFloat(b.closing) - parseFloat(a.closing));

  const t = rows.reduce((acc, r) => ({
    credits: acc.credits + parseFloat(r.credits),
    debits:  acc.debits  + parseFloat(r.debits),
    closing: acc.closing + parseFloat(r.closing),
    opening: acc.opening + parseFloat(r.opening),
  }), { credits: 0, debits: 0, closing: 0, opening: 0 });

  res.json({
    startDate: start.toISOString(), endDate: end.toISOString(), scope,
    rows,
    totals: {
      opening: t.opening.toFixed(8),
      credits: t.credits.toFixed(8), debits: t.debits.toFixed(8),
      net: (t.credits - t.debits).toFixed(8),
      closing: t.closing.toFixed(8),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT & CONTROL  GET /api/reports/audit-checks
// Surfaces anomalies: negative stock, sales without payment, large pending,
// last cash count diffs, recent destructive audit log entries.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/reports/audit-checks", requireAuth, async (req, res): Promise<void> => {
  const scope = readScope(req as never);
  if ("error" in scope) { res.status(scope.error.status).json(scope.error.body); return; }

  const prodConds = [eq(productsTable.isActive, true)];
  if (scope.locationId) prodConds.push(eq(productsTable.locationId, scope.locationId));

  // Negative stock products
  const negStock = await db.select({
    id: productsTable.id, name: productsTable.name, stock: productsTable.stock, locationId: productsTable.locationId,
  }).from(productsTable).where(and(...prodConds, lt(productsTable.stock, 0)));

  // Zero-stock active products (potential lost-sale alert)
  const zeroStock = await db.select({
    id: productsTable.id, name: productsTable.name, locationId: productsTable.locationId,
  }).from(productsTable).where(and(...prodConds, eq(productsTable.stock, 0)));

  // Sales with credit (amountPaid < total)
  const salesConds = [sql`cast(${salesTable.amountPaid} as numeric) < cast(${salesTable.total} as numeric)`];
  if (scope.locationId) salesConds.push(eq(salesTable.locationId, scope.locationId));
  const unpaidSales = await db.select({
    id: salesTable.id, invoiceNo: salesTable.invoiceNo,
    total: salesTable.total, amountPaid: salesTable.amountPaid,
    createdAt: salesTable.createdAt, customerId: salesTable.customerId, locationId: salesTable.locationId,
  }).from(salesTable).where(and(...salesConds)).orderBy(desc(salesTable.createdAt)).limit(50);

  // Outstanding receivables/payables — scoped by userId for non-admin
  const recConds = [eq(creditsTable.type, "receivable")];
  const payConds = [eq(creditsTable.type, "payable")];
  if (!scope.isAdmin && scope.userId) {
    recConds.push(eq(creditsTable.userId, scope.userId));
    payConds.push(eq(creditsTable.userId, scope.userId));
  }
  const [recRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(creditsTable).where(and(...recConds));

  const [payRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
    count: sql<string>`count(*)`,
  }).from(creditsTable).where(and(...payConds));

  // Recent destructive audit log entries — scoped by userId for non-admin
  const delConds = [sql`lower(${auditLogsTable.action}) like '%delete%'`];
  if (!scope.isAdmin && scope.userId) {
    delConds.push(eq(auditLogsTable.userId, scope.userId));
  }
  const deletions = await db.select({
    id: auditLogsTable.id, userId: auditLogsTable.userId, action: auditLogsTable.action,
    entityType: auditLogsTable.entityType, entityId: auditLogsTable.entityId,
    details: auditLogsTable.details, createdAt: auditLogsTable.createdAt,
  }).from(auditLogsTable)
    .where(and(...delConds))
    .orderBy(desc(auditLogsTable.createdAt)).limit(20);

  res.json({
    generatedAt: new Date().toISOString(),
    scope,
    negativeStock: { count: negStock.length, items: negStock },
    zeroStock:     { count: zeroStock.length, items: zeroStock.slice(0, 50) },
    unpaidSales:   {
      count: unpaidSales.length,
      items: unpaidSales.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), pending: (parseFloat(s.total) - parseFloat(s.amountPaid)).toFixed(8) })),
    },
    receivables: { total: recRow?.total ?? "0", count: parseInt(recRow?.count ?? "0") },
    payables:    { total: payRow?.total ?? "0", count: parseInt(payRow?.count ?? "0") },
    recentDeletions: deletions.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })),
  });
});

export default router;
