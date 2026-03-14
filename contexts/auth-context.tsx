import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  clearSessionToken,
  getSessionToken,
  getUserInfo,
  setSessionToken as storeSessionToken,
  setUserInfo as storeUserInfo,
  type UserInfo,
} from '@/lib/api';

type AuthContextValue = {
  sessionToken: string | null;
  user: UserInfo | null;
  checkingSession: boolean;
  setSessionToken: (token: string, user?: UserInfo) => Promise<void>;
  clearSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    Promise.all([getSessionToken(), getUserInfo()])
      .then(([token, userInfo]) => {
        setSessionTokenState(token);
        setUser(userInfo);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  async function setToken(token: string, userInfo?: UserInfo) {
    await storeSessionToken(token);
    setSessionTokenState(token);
    if (userInfo) {
      await storeUserInfo(userInfo);
      setUser(userInfo);
    }
  }

  async function clearSession() {
    await clearSessionToken();
    setSessionTokenState(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ sessionToken, user, checkingSession, setSessionToken: setToken, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
