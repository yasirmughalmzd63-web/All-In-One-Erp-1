import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  supplierId: integer("supplier_id"),
  locationId: integer("location_id"),
  accountId: integer("account_id"),
  userId: integer("user_id").notNull(),
  businessId: integer("business_id"),
  subtotal: text("subtotal").notNull().default("0.00000000"),
  discount: text("discount").notNull().default("0.00000000"),
  total: text("total").notNull().default("0.00000000"),
  amountPaid: text("amount_paid").notNull().default("0.00000000"),
  status: text("status").notNull().default("completed"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseItemsTable = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull(),
  productId: integer("product_id").notNull(),
  qty: integer("qty").notNull(),
  unitCost: text("unit_cost").notNull(),
  total: text("total").notNull(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
export type PurchaseItem = typeof purchaseItemsTable.$inferSelect;
