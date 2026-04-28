import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db, locationsTable, accountsTable, productsTable,
  creditsTable, salesTable, usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();
const EXCHANGE_RATE = 285;

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

export default router;
