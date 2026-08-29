// Auth session provider.
// Sole responsibility: surface the authenticated user state and login/logout
// actions to the app shell, loading them from the API client on mount.

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { ApiClient, type AuthUser } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  children,
  client,
}: Readonly<{ children: ReactNode; client?: ApiClient }>): ReactNode {
  const [currentClient] = useState<ApiClient>(() => client ?? new ApiClient());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log('[AuthProvider] MOUNT');
    return () => {
      console.log('[AuthProvider] UNMOUNT');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void currentClient
      .me()
      .then((current) => {
        console.log('[AuthProvider] me() resolved:', current, '| cancelled:', cancelled);
        if (!cancelled) {
          setUser(current);
        }
      })
      .catch((reason: unknown) => {
        console.error('[AuthProvider] me() rejected:', reason);
        if (!cancelled) {
          setUser(null);
          setError(reason instanceof Error ? reason : new Error(String(reason)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentClient]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isLoading,
      error,
      login: () => {
        window.location.assign(currentClient.loginUrl());
      },
      logout: async () => {
        await currentClient.logout();
        setUser(null);
      },
    }),
    [user, isLoading, error, currentClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
