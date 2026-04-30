import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dollarWalletTable = pgTable("dollar_wallet", {
  id: serial("id").primaryKey(),
  entryType: text("entry_type").notNull().default("received"),
  amountUsd: text("amount_usd").notNull().default("0.00000000"),
  rate: text("rate").notNull().default("0.00000000"),
  totalPkr: text("total_pkr").notNull().default("0.00000000"),
  partyName: text("party_name"),
  partyType: text("party_type"),
  partyId: integer("party_id"),
  walletId: integer("wallet_id"),
  accountId: integer("account_id"),
  productId: integer("product_id"),
  qty: integer("qty"),
  paymentMode: text("payment_mode").default("wallet"),
  notes: text("notes"),
  date: text("date").notNull(),
  userId: text("user_id").notNull().default("0"),
  paymentProofUrl: text("payment_proof_url"),
  paymentProofKey: text("payment_proof_key"),
  proofVerifiedAt: timestamp("proof_verified_at", { withTimezone: true }),
  proofVerifiedBy: integer("proof_verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  entryTypeCreatedIdx: index("dollar_wallet_entry_type_created_idx").on(t.entryType, t.createdAt),
  walletCreatedIdx: index("dollar_wallet_wallet_created_idx").on(t.walletId, t.createdAt),
}));

export const insertDollarWalletSchema = createInsertSchema(dollarWalletTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDollarWallet = z.infer<typeof insertDollarWalletSchema>;
export type DollarWallet = typeof dollarWalletTable.$inferSelect;
