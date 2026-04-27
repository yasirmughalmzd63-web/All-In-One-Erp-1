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
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

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
