import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const currencyTransactionsTable = pgTable("currency_transactions", {
  id: serial("id").primaryKey(),
  currencyType: text("currency_type").notNull().default("USD"),
  type: text("type").notNull().default("purchase"),
  amount: text("amount").notNull().default("0.00000000"),
  rate: text("rate").notNull().default("0.00000000"),
  totalInBase: text("total_in_base").notNull().default("0.00000000"),
  accountId: integer("account_id"),
  userId: integer("user_id").notNull(),
  notes: text("notes"),
  date: text("date").notNull(),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCurrencyTransactionSchema = createInsertSchema(currencyTransactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCurrencyTransaction = z.infer<typeof insertCurrencyTransactionSchema>;
export type CurrencyTransaction = typeof currencyTransactionsTable.$inferSelect;
