import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  baseSalary: text("base_salary").notNull().default("0.00"),
  workingDays: integer("working_days").notNull().default(26),
  presentDays: integer("present_days").notNull().default(0),
  halfDays: integer("half_days").notNull().default(0),
  overtimeHours: text("overtime_hours").notNull().default("0"),
  overtimeRate: text("overtime_rate").notNull().default("0"),
  grossSalary: text("gross_salary").notNull().default("0.00"),
  bonusTotal: text("bonus_total").notNull().default("0.00"),
  fineTotal: text("fine_total").notNull().default("0.00"),
  deductions: text("deductions").notNull().default("0.00"),
  netSalary: text("net_salary").notNull().default("0.00"),
  status: text("status").notNull().default("pending"),
  paidAt: text("paid_at"),
  notes: text("notes"),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;
