import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessRegistrationsTable = pgTable("business_registrations", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  purpose: text("purpose"),
  package: text("package").notNull().default("basic"),
  adminUsername: text("admin_username").notNull(),
  adminPasswordHash: text("admin_password_hash").notNull(),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  // Subscription / Payment tracking
  paymentMethod: text("payment_method"),        // cash | easypaisa | jazzcash | bank_transfer | stripe | none
  paymentStatus: text("payment_status").default("trial"), // trial | active | overdue | cancelled
  subscriptionEndDate: text("subscription_end_date"),     // YYYY-MM-DD
  monthlyFee: text("monthly_fee"),              // numeric string e.g. "2499.00"
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBusinessRegistrationSchema = createInsertSchema(businessRegistrationsTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true, rejectionReason: true,
});
export type InsertBusinessRegistration = z.infer<typeof insertBusinessRegistrationSchema>;
export type BusinessRegistration = typeof businessRegistrationsTable.$inferSelect;
