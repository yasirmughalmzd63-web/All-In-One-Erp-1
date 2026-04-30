import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usdPurchasesTable = pgTable("usd_purchases", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  dollarAmount: text("dollar_amount").notNull().default("0.00"),
  dollarRate: text("dollar_rate").notNull().default("0.00"),
  totalPkr: text("total_pkr").notNull().default("0.00"),

  // Coins settlement
  coinsPkr: text("coins_pkr").notNull().default("0.00"),
  coinsProductId: integer("coins_product_id"),
  coinsProductName: text("coins_product_name"),
  coinsQty: text("coins_qty").notNull().default("0"),

  // Cash settlement
  cashPkr: text("cash_pkr").notNull().default("0.00"),
  cashAccountId: integer("cash_account_id"),
  cashAccountName: text("cash_account_name"),

  // Credit settlement (payable to customer)
  creditPkr: text("credit_pkr").notNull().default("0.00"),
  creditId: integer("credit_id"),

  notes: text("notes"),
  date: text("date").notNull(),
  userId: integer("user_id"),
  locationId: integer("location_id"),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsdPurchaseSchema = createInsertSchema(usdPurchasesTable).omit({ id: true, createdAt: true });
export type InsertUsdPurchase = z.infer<typeof insertUsdPurchaseSchema>;
export type UsdPurchase = typeof usdPurchasesTable.$inferSelect;
