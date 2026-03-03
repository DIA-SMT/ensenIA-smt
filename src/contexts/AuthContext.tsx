import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, School } from '../types';
import { loginCredentials, getUserById } from '../data/mockUsers';
import { school as mockSchool } from '../data/mockSchool';

interface AuthContextType {
  user: User | null;
  school: School | null;
  isAuthenticated: boolean;
  isDirector: boolean;
  isDocente: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'ensenia_userId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedUserId = localStorage.getItem(STORAGE_KEY);
    if (savedUserId) {
      const found = getUserById(savedUserId);
      if (found) {
        setUser(found);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate async (mirrors real Supabase auth)
    await new Promise(r => setTimeout(r, 400));

    const normalizedEmail = email.toLowerCase().trim();
    const cred = loginCredentials[normalizedEmail];

    if (!cred) {
      return { success: false, error: 'No se encontró una cuenta con ese email.' };
    }

    if (cred.password !== password) {
      return { success: false, error: 'Contraseña incorrecta.' };
    }

    const found = getUserById(cred.userId);
    if (!found) {
      return { success: false, error: 'Error interno: usuario no encontrado.' };
    }

    setUser(found);
    localStorage.setItem(STORAGE_KEY, found.id);
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    navigate('/login');
  }, [navigate]);

  const value: AuthContextType = {
    user,
    school: user ? mockSchool : null,
    isAuthenticated: !!user,
    isDirector: user?.role === 'director',
    isDocente: user?.role === 'docente',
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
