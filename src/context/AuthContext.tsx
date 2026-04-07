// @refresh reset
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Therapist } from '../types';
import { mockTherapist, MOCK_PASSWORD } from '../data/mockData';

interface AuthContextValue {
  therapist: Therapist | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [therapist, setTherapist] = useState<Therapist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setLoginError(null);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (
      email.toLowerCase() === mockTherapist.email.toLowerCase() &&
      password === MOCK_PASSWORD
    ) {
      setTherapist(mockTherapist);
      setIsLoading(false);
      return true;
    }

    setLoginError('כתובת דוא"ל או סיסמה שגויים. נסה שוב.');
    setIsLoading(false);
    return false;
  }, []);

  const logout = useCallback(() => {
    setTherapist(null);
    setLoginError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        therapist,
        isAuthenticated: therapist !== null,
        isLoading,
        loginError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
