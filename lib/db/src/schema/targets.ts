import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const targetsTable = pgTable("targets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("daily"),         // daily | weekly
  scope: text("scope").notNull().default("app"),          // user | app
  employeeId: integer("employee_id"),                     // nullable – user-wise only
  userId: integer("user_id"),                             // salesperson userId
  targetAmount: text("target_amount").notNull().default("0.00"),
  commissionType: text("commission_type").notNull().default("flat"), // percentage | flat
  commissionValue: text("commission_value").notNull().default("0.00"),
  startDate: text("start_date").notNull(),               // YYYY-MM-DD
  endDate: text("end_date").notNull(),                   // YYYY-MM-DD
  status: text("status").notNull().default("active"),    // active | achieved | missed | done
  achievedAmount: text("achieved_amount").notNull().default("0.00"),
  bonusId: integer("bonus_id"),                          // set after commission applied
  locationId: integer("location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTargetSchema = createInsertSchema(targetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTarget = z.infer<typeof insertTargetSchema>;
export type Target = typeof targetsTable.$inferSelect;
