import { Router } from "express";
import {
  db,
  salesTable, saleItemsTable,
  purchasesTable, purchaseItemsTable,
  expensesTable,
  creditsTable, creditPaymentsTable,
  dollarWalletTable, walletsTable,
  usdPurchasesTable, appCoinCreditsTable, appCoinCreditPaymentsTable,
  stockTransfersTable,
  cashCountsTable,
  currencyTransactionsTable,
  attendanceTable, payrollTable, employeeBonusesTable, employeeFinesTable, leaveRequestsTable,
  auditLogsTable,
  accountsTable, productsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../lib/permissions.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// Each category lists the tables it wipes (in safe FK order — children first)
// and any "side effects" (e.g. resetting balances to 0).
type ResetCategory = {
  key: string;
  label: string;
  description: string;
  // Returns count of rows that would be cleared, for the counts endpoint.
  count: () => Promise<number>;
  // Performs the actual deletion + side effects.
  run: () => Promise<{ cleared: number; sideEffects?: string }>;
};

async function tableCount(table: { _: { name?: string } } | unknown, name: string): Promise<number> {
  // Use raw count to keep the implementation table-agnostic.
  const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM "${name}"`));
  // node-pg returns rows on `.rows`; drizzle wraps it.
  const rows = (r as unknown as { rows: { c: number }[] }).rows;
  return rows[0]?.c ?? 0;
}

const CATEGORIES: ResetCategory[] = [
  {
    key: "sales",
    label: "Sales",
    description: "All sales and their line items",
    count: () => tableCount(salesTable, "sales"),
    async run() {
      const before = await tableCount(salesTable, "sales");
      await db.delete(saleItemsTable);
      await db.delete(salesTable);
      return { cleared: before };
    },
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "All purchase records and their line items",
    count: () => tableCount(purchasesTable, "purchases"),
    async run() {
      const before = await tableCount(purchasesTable, "purchases");
      await db.delete(purchaseItemsTable);
      await db.delete(purchasesTable);
      return { cleared: before };
    },
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "All expense entries",
    count: () => tableCount(expensesTable, "expenses"),
    async run() {
      const before = await tableCount(expensesTable, "expenses");
      await db.delete(expensesTable);
      return { cleared: before };
    },
  },
  {
    key: "credits",
    label: "Credits & Payments (PKR)",
    description: "Receivables, payables, and all PKR credit payments",
    count: () => tableCount(creditsTable, "credits"),
    async run() {
      const before = await tableCount(creditsTable, "credits");
      await db.delete(creditPaymentsTable);
      await db.delete(creditsTable);
      return { cleared: before };
    },
  },
  {
    key: "dollar-wallet",
    label: "Dollar Wallet Activity",
    description: "All USD ledger entries (purchases, topups, splits) — also resets every dollar wallet balance to $0",
    count: () => tableCount(dollarWalletTable, "dollar_wallet"),
    async run() {
      const before = await tableCount(dollarWalletTable, "dollar_wallet");
      await db.delete(dollarWalletTable);
      await db.update(walletsTable).set({ balance: "0.00000000" });
      return { cleared: before, sideEffects: "All wallet balances reset to 0" };
    },
  },
  {
    key: "app-wallets",
    label: "App Wallet Activity",
    description: "USDT topups, coin credits, and credit payments per app",
    count: async () => {
      const a = await tableCount(usdPurchasesTable, "usd_purchases");
      const b = await tableCount(appCoinCreditsTable, "app_coin_credits");
      return a + b;
    },
    async run() {
      const a = await tableCount(usdPurchasesTable, "usd_purchases");
      const b = await tableCount(appCoinCreditsTable, "app_coin_credits");
      await db.delete(appCoinCreditPaymentsTable);
      await db.delete(appCoinCreditsTable);
      await db.delete(usdPurchasesTable);
      return { cleared: a + b };
    },
  },
  {
    key: "stock-transfers",
    label: "Stock Transfers",
    description: "Inter-app/location stock transfer history",
    count: () => tableCount(stockTransfersTable, "stock_transfers"),
    async run() {
      const before = await tableCount(stockTransfersTable, "stock_transfers");
      await db.delete(stockTransfersTable);
      return { cleared: before };
    },
  },
  {
    key: "cash-counts",
    label: "Cash Counts & Reconciliation",
    description: "All cash-count snapshots and reconciliation entries",
    count: () => tableCount(cashCountsTable, "cash_counts"),
    async run() {
      const before = await tableCount(cashCountsTable, "cash_counts");
      await db.delete(cashCountsTable);
      return { cleared: before };
    },
  },
  {
    key: "currencies",
    label: "Currency Transactions",
    description: "Forex / currency exchange transactions",
    count: () => tableCount(currencyTransactionsTable, "currency_transactions"),
    async run() {
      const before = await tableCount(currencyTransactionsTable, "currency_transactions");
      await db.delete(currencyTransactionsTable);
      return { cleared: before };
    },
  },
  {
    key: "hrm",
    label: "HRM (Attendance, Payroll, Bonuses, Fines, Leaves)",
    description: "All staff attendance, payroll runs, bonuses, fines, and leave requests (employees themselves are kept)",
    count: async () => {
      const tables = ["attendance", "payroll", "employee_bonuses", "employee_fines", "leave_requests"];
      let total = 0;
      for (const t of tables) total += await tableCount(null, t);
      return total;
    },
    async run() {
      const before =
        (await tableCount(attendanceTable, "attendance")) +
        (await tableCount(payrollTable, "payroll")) +
        (await tableCount(employeeBonusesTable, "employee_bonuses")) +
        (await tableCount(employeeFinesTable, "employee_fines")) +
        (await tableCount(leaveRequestsTable, "leave_requests"));
      await db.delete(attendanceTable);
      await db.delete(payrollTable);
      await db.delete(employeeBonusesTable);
      await db.delete(employeeFinesTable);
      await db.delete(leaveRequestsTable);
      return { cleared: before };
    },
  },
  {
    key: "account-balances",
    label: "Account Balances → 0",
    description: "Resets every PKR account balance to ₨0 (does not delete any rows)",
    count: () => tableCount(accountsTable, "accounts"),
    async run() {
      const before = await tableCount(accountsTable, "accounts");
      await db.update(accountsTable).set({ balance: "0.00000000" });
      return { cleared: 0, sideEffects: `${before} account balance(s) set to 0` };
    },
  },
  {
    key: "product-stock",
    label: "Product Stock → 0",
    description: "Resets every product/coin stock to 0 (does not delete products themselves)",
    count: () => tableCount(productsTable, "products"),
    async run() {
      const before = await tableCount(productsTable, "products");
      await db.update(productsTable).set({ stock: 0 });
      return { cleared: 0, sideEffects: `${before} product stock value(s) set to 0` };
    },
  },
  {
    key: "audit-logs",
    label: "Audit Logs",
    description: "Activity history (this reset itself will be logged after clearing)",
    count: () => tableCount(auditLogsTable, "audit_logs"),
    async run() {
      const before = await tableCount(auditLogsTable, "audit_logs");
      await db.delete(auditLogsTable);
      return { cleared: before };
    },
  },
];

const ALL_TRANSACTIONAL_KEYS = [
  "sales", "purchases", "expenses", "credits",
  "dollar-wallet", "app-wallets", "stock-transfers",
  "cash-counts", "currencies", "hrm",
  "account-balances", "product-stock",
];

// GET /admin/reset/counts — returns current row counts for every category
router.get("/admin/reset/counts", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const out: Record<string, number> = {};
  for (const c of CATEGORIES) {
    try { out[c.key] = await c.count(); }
    catch { out[c.key] = 0; }
  }
  res.json({
    counts: out,
    categories: CATEGORIES.map(c => ({ key: c.key, label: c.label, description: c.description })),
    allTransactionalKeys: ALL_TRANSACTIONAL_KEYS,
  });
});

// POST /admin/reset/:category — wipes a category. Body: { confirm: "RESET" }
router.post("/admin/reset/:category", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== "RESET") {
    res.status(400).json({ error: 'Confirmation required: send body { "confirm": "RESET" }' });
    return;
  }

  const key = req.params.category;
  if (!key) { res.status(400).json({ error: "Category required" }); return; }

  // Special key: "all-transactions" runs every transactional category
  if (key === "all-transactions") {
    const results: Array<{ key: string; cleared: number; sideEffects?: string }> = [];
    for (const k of ALL_TRANSACTIONAL_KEYS) {
      const cat = CATEGORIES.find(c => c.key === k);
      if (!cat) continue;
      try {
        const r = await cat.run();
        results.push({ key: k, cleared: r.cleared, sideEffects: r.sideEffects });
      } catch (e) {
        req.log.error({ err: e, category: k }, "reset category failed");
        res.status(500).json({ error: `Failed at ${k}: ${e instanceof Error ? e.message : "unknown"}`, results });
        return;
      }
    }
    const total = results.reduce((s, r) => s + r.cleared, 0);
    await logAudit(req.userId, "reset", "all-transactions", undefined, `Wiped all transactional data (${total} rows total across ${results.length} categories)`);
    res.json({ ok: true, results, total });
    return;
  }

  const cat = CATEGORIES.find(c => c.key === key);
  if (!cat) { res.status(404).json({ error: `Unknown category: ${key}` }); return; }

  try {
    const r = await cat.run();
    // Log AFTER the delete so the audit-log clear case still records the action.
    await logAudit(req.userId, "reset", cat.key, undefined,
      `Cleared ${cat.label} (${r.cleared} rows${r.sideEffects ? `; ${r.sideEffects}` : ""})`);
    res.json({ ok: true, key: cat.key, label: cat.label, cleared: r.cleared, sideEffects: r.sideEffects });
  } catch (e) {
    req.log.error({ err: e, category: key }, "reset category failed");
    res.status(500).json({ error: e instanceof Error ? e.message : "Reset failed" });
  }
});

export default router;
