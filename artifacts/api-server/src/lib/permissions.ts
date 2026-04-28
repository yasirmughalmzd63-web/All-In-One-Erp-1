import type { Request, Response } from "express";

export function canModify(req: Request, res: Response, entryUserId: number | null | undefined): boolean {
  if (req.userRole === "admin") return true;
  if (entryUserId != null && entryUserId === req.userId) return true;
  res.status(403).json({ error: "Permission denied. You can only modify your own entries." });
  return false;
}

export function requireAdmin(req: Request, res: Response): boolean {
  if (req.userRole === "admin") return true;
  res.status(403).json({ error: "Admin access required." });
  return false;
}

export function requireAdminOrManager(req: Request, res: Response): boolean {
  if (req.userRole === "admin" || req.userRole === "manager") return true;
  res.status(403).json({ error: "Admin or Manager access required." });
  return false;
}

export function isAdmin(req: Request): boolean {
  return req.userRole === "admin";
}

export function isAdminOrManager(req: Request): boolean {
  return req.userRole === "admin" || req.userRole === "manager";
}
