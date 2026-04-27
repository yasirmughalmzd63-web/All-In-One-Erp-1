import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockTransfersTable = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  fromLocationId: integer("from_location_id").notNull(),
  toLocationId: integer("to_location_id").notNull(),
  fromProductId: integer("from_product_id").notNull(),
  toProductId: integer("to_product_id").notNull(),
  qty: integer("qty").notNull(),
  notes: text("notes"),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStockTransferSchema = createInsertSchema(stockTransfersTable).omit({ id: true, createdAt: true });
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransfer = typeof stockTransfersTable.$inferSelect;
