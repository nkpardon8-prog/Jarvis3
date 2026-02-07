"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api } from "@/lib/api";

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  onboardingProgress?: {
    step: number;
    completed: boolean;
  } | null;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasUsers: boolean | null;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (
    username: string,
    password: string,
    displayName?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  hasUsers: null,
  login: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<User>("/auth/me");
      if (res.ok && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get<{ hasUsers: boolean }>("/auth/status");
      if (res.ok && res.data) {
        setHasUsers(res.data.hasUsers);
      }
    } catch {
      // Server not reachable
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([refreshUser(), checkStatus()]);
      setIsLoading(false);
    };
    init();
  }, [refreshUser, checkStatus]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.post<User>("/auth/login", { username, password });
      if (res.ok && res.data) {
        setUser(res.data);
        setHasUsers(true);
        return { ok: true };
      }
      return { ok: false, error: res.error || "Login failed" };
    },
    []
  );

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      const res = await api.post<User>("/auth/register", {
        username,
        password,
        displayName,
      });
      if (res.ok && res.data) {
        setUser(res.data);
        setHasUsers(true);
        return { ok: true };
      }
      return { ok: false, error: res.error || "Registration failed" };
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        hasUsers,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
