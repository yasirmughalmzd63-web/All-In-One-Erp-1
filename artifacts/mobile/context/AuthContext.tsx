import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  locationId: number | null;
  isActive: boolean;
  privileges: string[] | null;
  createdAt: string;
}

export const ALL_MODULES = [
  "dashboard", "pos", "sales", "purchases", "expenses", "credits",
  "inventory", "customers", "suppliers", "accounts", "locations",
  "categories", "users", "audit", "currency", "cash_count", "reconciliation",
  "pos_product", "pos_location", "pos_account", "pos_credit_customer",
] as const;

export type AppModule = typeof ALL_MODULES[number];

// ── Role helpers ─────────────────────────────────────────────────────────────
export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.role === "super_admin";
}

export function isAdminOrAbove(user: AuthUser | null): boolean {
  return user?.role === "admin" || user?.role === "super_admin";
}

// ── Module-level privilege check ─────────────────────────────────────────────
export function hasPrivilege(user: AuthUser | null, module: AppModule): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.privileges || user.privileges.length === 0) return true;
  return user.privileges.includes(module);
}

// ── Entity-level privilege checks ────────────────────────────────────────────
// Logic: admin/super_admin → always. null privileges → always. pos_product → all products.
// If user has any product:X entries → only those. Otherwise no restriction.

export function hasProductAccess(user: AuthUser | null, productId: number): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.privileges || user.privileges.length === 0) return true;
  if (user.privileges.includes("pos_product")) return true;
  const entityPrivs = user.privileges.filter(p => p.startsWith("product:"));
  if (entityPrivs.length === 0) return true; // no product restrictions configured
  return user.privileges.includes(`product:${productId}`);
}

export function hasAccountAccess(user: AuthUser | null, accountId: number): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.privileges || user.privileges.length === 0) return true;
  if (user.privileges.includes("pos_account")) return true;
  const entityPrivs = user.privileges.filter(p => p.startsWith("account:"));
  if (entityPrivs.length === 0) return true;
  return user.privileges.includes(`account:${accountId}`);
}

export function hasLocationAccess(user: AuthUser | null, locationId: number): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.privileges || user.privileges.length === 0) return true;
  if (user.privileges.includes("pos_location")) return true;
  const entityPrivs = user.privileges.filter(p => p.startsWith("location:"));
  if (entityPrivs.length === 0) return true;
  return user.privileges.includes(`location:${locationId}`);
}

// ── Helpers to extract allowed entity IDs ────────────────────────────────────
// Returns null when ALL are allowed, or a Set of allowed IDs.
export function getAllowedProductIds(user: AuthUser | null): Set<number> | null {
  if (!user || !user.privileges || user.privileges.length === 0) return null;
  if (user.role === "admin" || user.role === "super_admin") return null;
  if (user.privileges.includes("pos_product")) return null;
  const ids = user.privileges.filter(p => p.startsWith("product:")).map(p => parseInt(p.split(":")[1]!));
  return ids.length > 0 ? new Set(ids) : null;
}

export function getAllowedAccountIds(user: AuthUser | null): Set<number> | null {
  if (!user || !user.privileges || user.privileges.length === 0) return null;
  if (user.role === "admin" || user.role === "super_admin") return null;
  if (user.privileges.includes("pos_account")) return null;
  const ids = user.privileges.filter(p => p.startsWith("account:")).map(p => parseInt(p.split(":")[1]!));
  return ids.length > 0 ? new Set(ids) : null;
}

export function getAllowedLocationIds(user: AuthUser | null): Set<number> | null {
  if (!user || !user.privileges || user.privileges.length === 0) return null;
  if (user.role === "admin" || user.role === "super_admin") return null;
  if (user.privileges.includes("pos_location")) return null;
  const ids = user.privileges.filter(p => p.startsWith("location:")).map(p => parseInt(p.split(":")[1]!));
  return ids.length > 0 ? new Set(ids) : null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, token: null, isLoading: true,
  login: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadStoredAuth(); }, []);
  useEffect(() => {
    const currentToken = token;
    setAuthTokenGetter(() => currentToken);
  }, [token]);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem("erp_auth_token");
      const storedUser = await AsyncStorage.getItem("erp_auth_user");
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const response = await fetch(`https://${domain}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const err = await response.json() as { error?: string };
      throw new Error(err.error ?? "Login failed");
    }
    const data = await response.json() as { token: string; user: AuthUser };
    await AsyncStorage.setItem("erp_auth_token", data.token);
    await AsyncStorage.setItem("erp_auth_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("erp_auth_token");
    await AsyncStorage.removeItem("erp_auth_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
