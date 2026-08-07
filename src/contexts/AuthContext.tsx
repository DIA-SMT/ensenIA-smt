import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, School } from '../types';
import { supabase } from '../lib/supabase';
import { getProfile, getSchool } from '../services/profiles.service';

/**
 * Reglas de este contexto (aprendidas a fuerza de bugs):
 *
 * 1. El callback de onAuthStateChange NUNCA hace awaits de supabase:
 *    supabase-js ejecuta el callback sosteniendo el lock de auth
 *    (navigator.locks) y cualquier llamada interna que vuelva a pedir el
 *    lock puede deadlockear → pantalla "Cargando..." infinita.
 *    El trabajo async se despacha afuera con setTimeout(0).
 *
 * 2. Watchdog: pase lo que pase, isLoading baja a los 8s. Si hay un
 *    perfil cacheado del último login, se usa (modo offline).
 *
 * 3. El perfil se cachea en localStorage: sin conexión, la app arranca
 *    igual con los datos del último uso (los service workers cachean el
 *    resto de los datos).
 */

const PROFILE_CACHE_KEY = 'ensenia_profile_cache_v1';

interface ProfileCache {
  user: User;
  school: School;
}

function readProfileCache(): ProfileCache | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileCache;
    if (!parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeProfileCache(cache: ProfileCache) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage lleno o bloqueado: no es crítico */ }
}

function clearProfileCache() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* noop */ }
}

interface AuthContextType {
  user: User | null;
  school: School | null;
  isAuthenticated: boolean;
  isDirector: boolean;
  isDocente: boolean;
  isEstudiante: boolean;
  isLoading: boolean;
  /** true cuando estamos mostrando el perfil cacheado sin poder validar contra el servidor */
  isOfflineProfile: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineProfile, setIsOfflineProfile] = useState(false);
  const navigate = useNavigate();

  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    // 8s y la app deja de bloquear, con o sin respuesta del servidor.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      const cached = readProfileCache();
      if (cached) {
        setUser(cached.user);
        setSchool(cached.school);
        setIsOfflineProfile(true);
      }
      setIsLoading(false);
    }, 8000);

    const finish = () => {
      if (cancelled) return;
      clearTimeout(watchdog);
      setIsLoading(false);
    };

    // Carga de perfil SIEMPRE fuera del callback de auth (ver nota arriba).
    const loadProfileDeferred = (userId: string) => {
      setTimeout(async () => {
        if (cancelled) return;
        try {
          const profile = await getProfile(userId);
          const schoolData = await getSchool(profile.schoolId);
          if (cancelled) return;
          setUser(profile);
          setSchool(schoolData);
          setIsOfflineProfile(false);
          writeProfileCache({ user: profile, school: schoolData });
        } catch (err) {
          console.error('No se pudo cargar el perfil (¿sin conexión?):', err);
          if (cancelled) return;
          // Modo offline: usamos el último perfil conocido de esta cuenta.
          const cached = readProfileCache();
          if (cached && cached.user.id === userId) {
            setUser(cached.user);
            setSchool(cached.school);
            setIsOfflineProfile(true);
          } else {
            setUser(null);
            setSchool(null);
          }
        } finally {
          finish();
        }
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // SIN awaits acá adentro. Solo decisiones sincrónicas.
      if (session?.user) {
        if (currentUserIdRef.current === session.user.id && event === 'TOKEN_REFRESHED') {
          // mismo usuario, solo se renovó el token: nada que recargar
          finish();
          return;
        }
        loadProfileDeferred(session.user.id);
      } else {
        // INITIAL_SESSION sin sesión, o SIGNED_OUT
        if (event === 'SIGNED_OUT') clearProfileCache();
        setUser(null);
        setSchool(null);
        setIsOfflineProfile(false);
        finish();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { success: false, error: 'Email o contraseña incorrectos.' };
      }
      if (error.message.includes('fetch') || error.name === 'AuthRetryableFetchError') {
        return { success: false, error: 'Sin conexión. Conectate a una red para iniciar sesión la primera vez.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    clearProfileCache();
    setUser(null);
    setSchool(null);
    setIsOfflineProfile(false);
    // En dispositivos compartidos, los datos cacheados offline no deben
    // quedar disponibles para el próximo usuario.
    if ('caches' in window) {
      caches.delete('supabase-rest').catch(() => {});
      caches.delete('supabase-storage').catch(() => {});
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('signOut falló (¿sin conexión?):', err);
    }
    navigate('/login');
  }, [navigate]);

  const value: AuthContextType = {
    user,
    school,
    isAuthenticated: !!user,
    isDirector: user?.role === 'director',
    isDocente: user?.role === 'docente',
    isEstudiante: user?.role === 'estudiante',
    isLoading,
    isOfflineProfile,
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
