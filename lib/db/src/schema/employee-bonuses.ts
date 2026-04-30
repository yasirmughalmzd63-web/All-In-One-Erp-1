import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeeBonusesTable = pgTable("employee_bonuses", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  amount: text("amount").notNull().default("0.00"),
  reason: text("reason").notNull(),
  date: text("date").notNull(),
  payrollId: integer("payroll_id"),
  locationId: integer("location_id"),
  businessId: integer("business_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEmployeeBonusSchema = createInsertSchema(employeeBonusesTable).omit({ id: true, createdAt: true });
export type InsertEmployeeBonus = z.infer<typeof insertEmployeeBonusSchema>;
export type EmployeeBonus = typeof employeeBonusesTable.$inferSelect;
