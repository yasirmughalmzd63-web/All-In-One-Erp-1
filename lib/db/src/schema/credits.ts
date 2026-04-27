import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditsTable = pgTable("credits", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("receivable"),
  partyId: integer("party_id").notNull(),
  partyType: text("party_type").notNull().default("customer"),
  amount: text("amount").notNull().default("0.00000000"),
  paidAmount: text("paid_amount").notNull().default("0.00000000"),
  remainingAmount: text("remaining_amount").notNull().default("0.00000000"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCreditSchema = createInsertSchema(creditsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof creditsTable.$inferSelect;
