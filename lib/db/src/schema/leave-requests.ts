import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leaveRequestsTable = pgTable("leave_requests", {
  id:           serial("id").primaryKey(),
  employeeId:   integer("employee_id").notNull(),
  leaveType:    text("leave_type").notNull().default("annual"),
  startDate:    text("start_date").notNull(),
  endDate:      text("end_date").notNull(),
  totalDays:    text("total_days").notNull().default("1"),
  reason:       text("reason"),
  status:       text("status").notNull().default("pending"),
  reviewedBy:   integer("reviewed_by"),
  reviewNotes:  text("review_notes"),
  submittedBy:  integer("submitted_by").notNull(),
  locationId:   integer("location_id"),
  businessId:   integer("business_id"),
  createdAt:    timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequestsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
