import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { citizenApi } from "../api/citizen";
import { clearTokens, getTokens, setTokens } from "../api/client";
import type { TokenPair, User } from "../types/api";

interface AuthState { user: User | null; loading: boolean; setSession: (user: User, tokens: TokenPair) => void; signOut: () => Promise<void>; refreshUser: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  const refreshUser = async () => { const result = await citizenApi.me(); if (result.user.role !== "CITIZEN") throw new Error("This portal is available to citizen accounts only."); setUser(result.user); };
  useEffect(() => {
    const restore = async () => { if (!getTokens()) { setLoading(false); return; } try { await refreshUser(); } catch { clearTokens(); setUser(null); } finally { setLoading(false); } };
    void restore();
    const expired = () => setUser(null); window.addEventListener("janseva-auth-expired", expired); return () => window.removeEventListener("janseva-auth-expired", expired);
  }, []);
  const value = useMemo<AuthState>(() => ({ user, loading, setSession: (nextUser, tokens) => { setTokens(tokens); setUser(nextUser); }, signOut: async () => { const refreshToken = getTokens()?.refreshToken; try { if (refreshToken) await citizenApi.logout(refreshToken); } finally { clearTokens(); setUser(null); } }, refreshUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthState { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used within AuthProvider"); return value; }
