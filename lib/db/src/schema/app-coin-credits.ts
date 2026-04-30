import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appCoinCreditsTable = pgTable("app_coin_credits", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  customerId: integer("customer_id"),
  customerName: text("customer_name").notNull(),
  qty: integer("qty").notNull().default(0),
  unitPricePkr: text("unit_price_pkr").notNull().default("0"),
  totalPkr: text("total_pkr").notNull().default("0"),
  paidPkr: text("paid_pkr").notNull().default("0"),
  remainingPkr: text("remaining_pkr").notNull().default("0"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  date: text("date").notNull(),
  dueDate: text("due_date"),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const appCoinCreditPaymentsTable = pgTable("app_coin_credit_payments", {
  id: serial("id").primaryKey(),
  creditId: integer("credit_id").notNull(),
  amountPkr: text("amount_pkr").notNull().default("0"),
  method: text("method").notNull().default("cash"),
  notes: text("notes"),
  date: text("date").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppCoinCreditSchema = createInsertSchema(appCoinCreditsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppCoinCreditPaymentSchema = createInsertSchema(appCoinCreditPaymentsTable).omit({ id: true, createdAt: true });

export type AppCoinCredit = typeof appCoinCreditsTable.$inferSelect;
export type AppCoinCreditPayment = typeof appCoinCreditPaymentsTable.$inferSelect;
export type InsertAppCoinCredit = z.infer<typeof insertAppCoinCreditSchema>;
export type InsertAppCoinCreditPayment = z.infer<typeof insertAppCoinCreditPaymentSchema>;
