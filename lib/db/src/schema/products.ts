import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  categoryId: integer("category_id"),
  unitPrice: text("unit_price").notNull().default("0.00000000"),
  wholesalePrice: text("wholesale_price").notNull().default("0.00000000"),
  costPrice: text("cost_price").notNull().default("0.00000000"),
  stock: integer("stock").notNull().default(0),
  locationId: integer("location_id"),
  unit: text("unit").notNull().default("pcs"),
  isActive: boolean("is_active").notNull().default(true),
  imageUrl: text("image_url"),
  topupCoinsPerUsd: text("topup_coins_per_usd"),
  topupExchangeRatePkr: text("topup_exchange_rate_pkr"),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
