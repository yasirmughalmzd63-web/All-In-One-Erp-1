import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cashCountsTable = pgTable("cash_counts", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  stockValue: text("stock_value").notNull().default("0.00000000"),
  bankBalance: text("bank_balance").notNull().default("0.00000000"),
  creditReceivable: text("credit_receivable").notNull().default("0.00000000"),
  creditsReceived: text("credits_received").notNull().default("0.00000000"),
  transfersIn: text("transfers_in").notNull().default("0.00000000"),
  transfersOut: text("transfers_out").notNull().default("0.00000000"),
  openingBalance: text("opening_balance").notNull().default("0.00000000"),
  expectedBalance: text("expected_balance").notNull().default("0.00000000"),
  physicalBalance: text("physical_balance").notNull().default("0.00000000"),
  difference: text("difference").notNull().default("0.00000000"),
  diffType: text("diff_type").notNull().default("balanced"),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  notes: text("notes"),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCashCountSchema = createInsertSchema(cashCountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCashCount = z.infer<typeof insertCashCountSchema>;
export type CashCount = typeof cashCountsTable.$inferSelect;
