import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db, cashCountsTable, productsTable, accountsTable, creditsTable
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/cash-counts/snapshot", requireAuth, async (_req, res): Promise<void> => {
  const [stockRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${productsTable.costPrice} as numeric) * ${productsTable.stock}), 0)`,
  }).from(productsTable);

  const [bankRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${accountsTable.balance} as numeric)), 0)`,
  }).from(accountsTable);

  const [creditReceivableRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.remainingAmount} as numeric)), 0)`,
  }).from(creditsTable).where(eq(creditsTable.type, "receivable"));

  const [creditsReceivedRow] = await db.select({
    total: sql<string>`coalesce(sum(cast(${creditsTable.paidAmount} as numeric)), 0)`,
  }).from(creditsTable).where(eq(creditsTable.type, "receivable"));

  const stockValue = parseFloat(stockRow?.total ?? "0");
  const bankBalance = parseFloat(bankRow?.total ?? "0");
  const creditReceivable = parseFloat(creditReceivableRow?.total ?? "0");
  const creditsReceived = parseFloat(creditsReceivedRow?.total ?? "0");
  const openingBalance = stockValue + bankBalance + creditReceivable;
  const expectedBalance = openingBalance + creditsReceived;

  res.json({
    stockValue: stockValue.toFixed(8),
    bankBalance: bankBalance.toFixed(8),
    creditReceivable: creditReceivable.toFixed(8),
    creditsReceived: creditsReceived.toFixed(8),
    transfersIn: "0.00000000",
    transfersOut: "0.00000000",
    openingBalance: openingBalance.toFixed(8),
    expectedBalance: expectedBalance.toFixed(8),
  });
});

router.get("/cash-counts", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(cashCountsTable).orderBy(desc(cashCountsTable.createdAt)).limit(50);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/cash-counts", requireAuth, async (req, res): Promise<void> => {
  const {
    date, stockValue, bankBalance, creditReceivable, creditsReceived,
    transfersIn, transfersOut, openingBalance, expectedBalance, physicalBalance, notes,
  } = req.body as {
    date?: string; stockValue?: string; bankBalance?: string; creditReceivable?: string;
    creditsReceived?: string; transfersIn?: string; transfersOut?: string;
    openingBalance?: string; expectedBalance?: string; physicalBalance?: string; notes?: string;
  };

  if (!date || !physicalBalance) {
    res.status(400).json({ error: "date, physicalBalance required" });
    return;
  }

  const expected = parseFloat(expectedBalance ?? "0");
  const physical = parseFloat(physicalBalance);
  const difference = (physical - expected).toFixed(8);

  const [row] = await db.insert(cashCountsTable).values({
    date,
    stockValue: stockValue ?? "0.00000000",
    bankBalance: bankBalance ?? "0.00000000",
    creditReceivable: creditReceivable ?? "0.00000000",
    creditsReceived: creditsReceived ?? "0.00000000",
    transfersIn: transfersIn ?? "0.00000000",
    transfersOut: transfersOut ?? "0.00000000",
    openingBalance: openingBalance ?? "0.00000000",
    expectedBalance: expectedBalance ?? "0.00000000",
    physicalBalance: physical.toFixed(8),
    difference,
    notes: notes ?? null,
    userId: req.userId,
  }).returning();

  await logAudit(req.userId, "create", "cash_count", row!.id, `Cash count ${date}: physical=${physicalBalance}, diff=${difference}`);
  res.status(201).json({ ...row!, createdAt: row!.createdAt.toISOString() });
});

router.delete("/cash-counts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
  const [existing] = await db.select({ id: cashCountsTable.id }).from(cashCountsTable).where(eq(cashCountsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(cashCountsTable).where(eq(cashCountsTable.id, id));
  await logAudit(req.userId, "delete", "cash_count", id);
  res.sendStatus(204);
});

export default router;
