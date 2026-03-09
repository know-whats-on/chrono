import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

interface AuthState {
  isLoggedIn: boolean;
  email: string | null;
  justLoggedIn: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string) => void;
  logout: () => void;
  clearJustLoggedIn: () => void;
}

const AUTH_STORAGE_KEY = "voca_auth";

const AuthContext = createContext<AuthContextValue>({
  isLoggedIn: false,
  email: null,
  justLoggedIn: false,
  login: () => {},
  logout: () => {},
  clearJustLoggedIn: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.isLoggedIn) {
          return { isLoggedIn: true, email: parsed.email || null, justLoggedIn: false };
        }
      }
    } catch {
      // ignore
    }
    return { isLoggedIn: false, email: null, justLoggedIn: false };
  });

  const login = useCallback((email: string) => {
    const next: AuthState = { isLoggedIn: true, email, justLoggedIn: true };
    setState(next);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ isLoggedIn: true, email }));
  }, []);

  const logout = useCallback(() => {
    const next: AuthState = { isLoggedIn: false, email: null, justLoggedIn: false };
    setState(next);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const clearJustLoggedIn = useCallback(() => {
    setState((prev) => ({ ...prev, justLoggedIn: false }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, clearJustLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}