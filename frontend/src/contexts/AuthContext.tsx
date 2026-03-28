import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  client_id: number | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  impersonate: (userId: number) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(
    () => !!sessionStorage.getItem('admin_backup_tokens')
  );

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    await fetchMe();
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      } catch { /* ignore */ }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('admin_backup_tokens');
    setIsImpersonating(false);
    setUser(null);
  };

  const impersonate = async (userId: number) => {
    const { data } = await api.post(`/auth/impersonate/${userId}`);
    sessionStorage.setItem('admin_backup_tokens', JSON.stringify({
      access_token: localStorage.getItem('access_token'),
      refresh_token: localStorage.getItem('refresh_token'),
    }));
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    setIsImpersonating(true);
    await fetchMe();
  };

  const stopImpersonating = async () => {
    const backup = sessionStorage.getItem('admin_backup_tokens');
    if (!backup) return;
    const { access_token, refresh_token } = JSON.parse(backup);
    // Revoke the impersonation refresh token
    const impersonationRefresh = localStorage.getItem('refresh_token');
    if (impersonationRefresh) {
      try {
        await api.post('/auth/logout', { refresh_token: impersonationRefresh });
      } catch { /* ignore */ }
    }
    sessionStorage.removeItem('admin_backup_tokens');
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setIsImpersonating(false);
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isImpersonating, login, logout, impersonate, stopImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
