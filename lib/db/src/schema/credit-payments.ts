import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditPaymentsTable = pgTable("credit_payments", {
  id: serial("id").primaryKey(),
  creditId: integer("credit_id").notNull(),
  amount: text("amount").notNull().default("0.00000000"),
  paymentMethod: text("payment_method").notNull().default("account"),
  accountId: integer("account_id"),
  dollarAmount: text("dollar_amount"),
  dollarRate: text("dollar_rate"),
  productId: integer("product_id"),
  productName: text("product_name"),
  productQty: text("product_qty"),
  productValuePkr: text("product_value_pkr"),
  notes: text("notes"),
  userId: integer("user_id").notNull(),
  locationId: integer("location_id"),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCreditPaymentSchema = createInsertSchema(creditPaymentsTable).omit({ id: true, createdAt: true });
export type InsertCreditPayment = z.infer<typeof insertCreditPaymentSchema>;
export type CreditPayment = typeof creditPaymentsTable.$inferSelect;
