import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  customerId: integer("customer_id"),
  locationId: integer("location_id"),
  accountId: integer("account_id"),
  userId: integer("user_id").notNull(),
  subtotal: text("subtotal").notNull().default("0.00000000"),
  discount: text("discount").notNull().default("0.00000000"),
  tax: text("tax").notNull().default("0.00000000"),
  total: text("total").notNull().default("0.00000000"),
  amountPaid: text("amount_paid").notNull().default("0.00000000"),
  change: text("change").notNull().default("0.00000000"),
  paymentMethod: text("payment_method").notNull().default("cash"),
  status: text("status").notNull().default("completed"),
  notes: text("notes"),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull(),
  productId: integer("product_id").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: text("unit_price").notNull(),
  total: text("total").notNull(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
