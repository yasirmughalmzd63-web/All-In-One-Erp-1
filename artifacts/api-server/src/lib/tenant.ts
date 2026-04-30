import type { Request } from "express";
import type { PgColumn } from "drizzle-orm/pg-core";
import { and, eq, isNull, type SQL } from "drizzle-orm";

/**
 * Returns a Drizzle WHERE clause that scopes a query to the caller's business.
 *
 * - super_admin: returns `undefined` (no filter — sees data from every business)
 * - admin/manager/cashier with a businessId: returns `column = businessId`
 * - user with NULL businessId (e.g. legacy seeded staff under the original business):
 *     returns `column IS NULL` so they only see "main business" rows
 */
export function tenantWhere(req: Request, businessIdColumn: PgColumn): SQL | undefined {
  if (req.userRole === "super_admin") return undefined;
  if (req.userBusinessId == null) return isNull(businessIdColumn);
  return eq(businessIdColumn, req.userBusinessId);
}

/**
 * Returns the businessId value to stamp on a new row created by this user.
 * - super_admin: null (data goes into the "main / original" pool)
 * - everyone else: their own businessId (which may itself be null for legacy users)
 */
export function tenantStamp(req: Request): number | null {
  if (req.userRole === "super_admin") return null;
  return req.userBusinessId ?? null;
}

/**
 * Returns true if a row with the given businessId is visible to / owned by the caller.
 * Use for PATCH/DELETE ownership checks.
 */
export function ownsRow(req: Request, rowBusinessId: number | null | undefined): boolean {
  if (req.userRole === "super_admin") return true;
  return (req.userBusinessId ?? null) === (rowBusinessId ?? null);
}

/**
 * Combines tenantWhere with another SQL condition (AND semantics).
 * Useful when a route already has a where clause and needs to also be tenant-scoped.
 */
export function andTenant(req: Request, businessIdColumn: PgColumn, extra?: SQL): SQL | undefined {
  const t = tenantWhere(req, businessIdColumn);
  if (!t) return extra;
  if (!extra) return t;
  return and(t, extra);
}
