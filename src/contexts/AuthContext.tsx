import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User, School, UserRole } from '../types';
import { supabase, sesionGuardada } from '../lib/supabase';
import { haySenial, suscribirConexion } from '../lib/conexion';
import { esEquipoPersonal, marcarEquipoPersonal } from '../lib/equipoPersonal';
import { getProfile, getSchool, getMySchools, switchSchool as switchSchoolRpc, type MySchool } from '../services/profiles.service';
import { toLoginEmail } from '../lib/dni';
import { olvidarBusquedas } from '../services/busqueda.service';
import { setDuenioCola } from '../services/offline-queue.service';

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
 *
 * 4. Sin red no se echa a nadie. Si la app abre sin señal con el token
 *    vencido, supabase-js no lo puede renovar y avisa "sin sesión", pero
 *    la deja guardada (solo la borra si el servidor la rechaza). Con la
 *    sesión guardada y el perfil de esa misma cuenta, se sigue en modo
 *    sin conexión; cuando vuelve la señal se valida sola.
 */

const PROFILE_CACHE_KEY = 'ensenia_profile_cache_v1';

/**
 * El personal de la escuela usa computadoras compartidas: su sesión se
 * cierra sola a las 12 h de haber entrado (alcanza para la jornada y no
 * queda abierta para el que se sienta después). Estudiantes y familias
 * entran desde su celular y no vencen.
 *
 * En su propio equipo ("Es mi equipo" al entrar) tampoco vence: el docente
 * prepara a la noche en casa y a la mañana lo usa en el aula sin señal, y
 * con el corte no habría podido volver a entrar.
 */
const DURACION_SESION_PERSONAL_MS = 12 * 60 * 60 * 1000;
const ROLES_CON_VENCIMIENTO: UserRole[] = ['docente', 'director', 'superadmin'];
/** La pantalla de login lo lee para explicar por qué hay que volver a entrar. */
export const SESION_VENCIDA_KEY = 'ensenia_sesion_vencida';

/**
 * Cuándo se entró con usuario y clave en ESTA sesión. Viaja en el token
 * (claim amr) y no cambia al renovarse cada hora; si falta, el último
 * ingreso de la cuenta.
 */
function inicioDeSesion(accessToken: string, ultimoIngreso?: string): number | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const marcas = (payload.amr ?? []).map((a: { timestamp?: number }) => a.timestamp).filter(Boolean) as number[];
    if (marcas.length) return Math.min(...marcas) * 1000;
  } catch { /* token raro: se usa el último ingreso */ }
  const t = ultimoIngreso ? Date.parse(ultimoIngreso) : NaN;
  return Number.isNaN(t) ? null : t;
}

interface ProfileCache {
  user: User;
  /** null para el superadmin, que no pertenece a ninguna escuela */
  school: School | null;
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

/**
 * Datos personales guardados para usar sin conexión (respuestas de la base
 * y archivos). En una compu compartida no pueden quedar para el siguiente:
 * se borran al cerrar sesión y también cuando entra OTRA persona sin que la
 * anterior haya cerrado (se cerró la pestaña, se venció la sesión).
 */
const CACHE_OWNER_KEY = 'estudia_duenio_datos_locales';

function borrarDatosOffline() {
  if ('caches' in window) {
    caches.delete('supabase-rest').catch(() => {});
    caches.delete('supabase-storage').catch(() => {});
  }
  olvidarBusquedas();
}

function reclamarDatosLocales(userId: string) {
  try {
    const duenio = localStorage.getItem(CACHE_OWNER_KEY);
    if (duenio && duenio !== userId) borrarDatosOffline();
    localStorage.setItem(CACHE_OWNER_KEY, userId);
  } catch { /* sin storage: no hay dueño que comparar */ }
}

function soltarDatosLocales() {
  borrarDatosOffline();
  try { localStorage.removeItem(CACHE_OWNER_KEY); } catch { /* noop */ }
}

interface AuthContextType {
  user: User | null;
  school: School | null;
  isAuthenticated: boolean;
  isDirector: boolean;
  isDocente: boolean;
  isEstudiante: boolean;
  isSuperadmin: boolean;
  isLoading: boolean;
  /** true cuando estamos mostrando el perfil cacheado sin poder validar contra el servidor */
  isOfflineProfile: boolean;
  /** Escuelas a las que pertenece (más de una: puede elegir la activa) */
  mySchools: MySchool[];
  /** email o DNI. equipoPersonal: la sesión del personal no vence en este equipo. */
  login: (emailOrDni: string, password: string, opciones?: { equipoPersonal?: boolean }) => Promise<{ success: boolean; error?: string; code?: 'invalid_credentials' }>;
  logout: () => void;
  /** Vuelve a leer el perfil (después de cambiar la clave, por ejemplo) */
  refreshProfile: () => Promise<void>;
  /** Cambia la escuela activa y recarga la app en esa escuela */
  switchSchool: (schoolId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineProfile, setIsOfflineProfile] = useState(false);
  const [mySchools, setMySchools] = useState<MySchool[]>([]);
  const navigate = useNavigate();

  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = user?.id ?? null;
  const offlineRef = useRef(false);
  offlineRef.current = isOfflineProfile;
  // Para volver a validar el perfil cuando vuelve la señal (lo llena el efecto de abajo)
  const recargarPerfilRef = useRef<((userId: string) => void) | null>(null);

  // La cola offline envía solo lo de quien tiene la sesión abierta.
  useEffect(() => { setDuenioCola(user?.id ?? null); }, [user?.id]);

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

    let terminado = false;
    const finish = () => {
      if (cancelled) return;
      terminado = true;
      clearTimeout(watchdog);
      setIsLoading(false);
    };

    // Sin señal no tiene sentido esperar los 8 s del watchdog (en el aula
    // es lo primero que se ve): con la sesión guardada y el perfil de esa
    // misma cuenta, se arranca ya en modo sin conexión.
    const arrancarSinSenial = () => {
      if (cancelled || terminado || haySenial()) return;
      const guardada = sesionGuardada();
      const cached = readProfileCache();
      if (!guardada || !cached || cached.user.id !== guardada.user.id) return;
      setUser(cached.user);
      setSchool(cached.school);
      setIsOfflineProfile(true);
      finish();
    };
    const dejarDeEscuchar = suscribirConexion(arrancarSinSenial);
    arrancarSinSenial();

    // Carga de perfil SIEMPRE fuera del callback de auth (ver nota arriba).
    const loadProfileDeferred = (userId: string) => {
      setTimeout(async () => {
        if (cancelled) return;
        try {
          const profile = await getProfile(userId);
          // El superadmin no tiene escuela activa
          const schoolData = profile.schoolId ? await getSchool(profile.schoolId) : null;
          const schools = await getMySchools(userId).catch(() => []);
          if (cancelled) return;
          reclamarDatosLocales(profile.id);
          setUser(profile);
          setSchool(schoolData);
          setMySchools(schools);
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
    recargarPerfilRef.current = loadProfileDeferred;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // SIN awaits acá adentro. Solo decisiones sincrónicas.
      if (session?.user) {
        if (currentUserIdRef.current === session.user.id && event === 'TOKEN_REFRESHED') {
          // Mismo usuario, solo se renovó el token. Si veníamos sin
          // conexión, es que volvió: se valida el perfil.
          if (offlineRef.current) loadProfileDeferred(session.user.id);
          else finish();
          return;
        }
        loadProfileDeferred(session.user.id);
      } else {
        // Arrancó sin poder renovar la sesión. Si sigue guardada, el
        // problema fue la red (ver regla 4): se sigue con el perfil guardado.
        if (event === 'INITIAL_SESSION') {
          const guardada = sesionGuardada();
          const cached = readProfileCache();
          if (guardada && cached && cached.user.id === guardada.user.id) {
            setUser(cached.user);
            setSchool(cached.school);
            setIsOfflineProfile(true);
            finish();
            return;
          }
        }
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
      dejarDeEscuchar();
      recargarPerfilRef.current = null;
    };
  }, []);

  // Volvió la señal y estábamos con el perfil guardado: se valida contra el
  // servidor (si el token estaba vencido, lo hace el TOKEN_REFRESHED de arriba).
  useEffect(() => suscribirConexion(() => {
    const id = currentUserIdRef.current;
    if (haySenial() && offlineRef.current && id && sesionGuardada()) recargarPerfilRef.current?.(id);
  }), []);

  const login = useCallback(async (
    emailOrDni: string,
    password: string,
    opciones?: { equipoPersonal?: boolean },
  ): Promise<{ success: boolean; error?: string; code?: 'invalid_credentials' }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(emailOrDni),
      password,
    });
    if (!error && data.user) marcarEquipoPersonal(data.user.id, !!opciones?.equipoPersonal);

    if (error) {
      if (error.code === 'invalid_credentials' || error.message.includes('Invalid login credentials')) {
        return { success: false, code: 'invalid_credentials', error: 'Usuario o contraseña incorrectos.' };
      }
      if (error.message.includes('fetch') || error.name === 'AuthRetryableFetchError') {
        return { success: false, error: 'Sin conexión. Conectate a una red para iniciar sesión la primera vez.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  }, []);

  // Cierra la sesión de ESTE dispositivo: el docente que sale de la compu
  // de la escuela sigue con la sesión abierta en su celular.
  const logout = useCallback(async () => {
    clearProfileCache();
    setUser(null);
    setSchool(null);
    setIsOfflineProfile(false);
    // En dispositivos compartidos, los datos cacheados offline no deben
    // quedar disponibles para el próximo usuario.
    soltarDatosLocales();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('signOut falló (¿sin conexión?):', err);
    }
    navigate('/login');
  }, [navigate]);

  // Vencimiento de la sesión del personal (ver DURACION_SESION_PERSONAL_MS).
  // Se revisa al cargar, con un timer y al volver a la pestaña: con la
  // compu suspendida los timers se frenan.
  const rolActual = user?.role;
  useEffect(() => {
    if (!rolActual || !ROLES_CON_VENCIMIENTO.includes(rolActual)) return;
    if (esEquipoPersonal(user?.id)) return;
    let terminado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const revisar = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (terminado || !session) return;
      const inicio = inicioDeSesion(session.access_token, session.user.last_sign_in_at);
      if (inicio === null) return;
      const restante = inicio + DURACION_SESION_PERSONAL_MS - Date.now();
      clearTimeout(timer);
      if (restante <= 0) {
        terminado = true;
        try { sessionStorage.setItem(SESION_VENCIDA_KEY, '1'); } catch { /* sin storage: sale sin aviso */ }
        void logout();
        return;
      }
      timer = setTimeout(revisar, restante + 1000);
    };

    void revisar();
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      terminado = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [user?.id, rolActual, logout]);

  const refreshProfile = useCallback(async () => {
    const id = currentUserIdRef.current;
    if (!id) return;
    const profile = await getProfile(id);
    const schoolData = profile.schoolId ? await getSchool(profile.schoolId) : null;
    setUser(profile);
    setSchool(schoolData);
    setMySchools(await getMySchools(id).catch(() => []));
    writeProfileCache({ user: profile, school: schoolData });
  }, []);

  const switchSchool = useCallback(async (schoolId: string) => {
    await switchSchoolRpc(schoolId);
    // Todo lo cargado (y lo cacheado offline) es de la otra escuela:
    // más simple y seguro arrancar de cero en la nueva.
    // Mismo criterio que borrarDatosOffline, pero esperando al caché antes
    // de recargar (si no, la recarga puede cortar el borrado a la mitad).
    clearProfileCache();
    olvidarBusquedas();
    if ('caches' in window) await caches.delete('supabase-rest').catch(() => false);
    window.location.assign('/');
  }, []);

  const value: AuthContextType = {
    user,
    school,
    isAuthenticated: !!user,
    isDirector: user?.role === 'director',
    isDocente: user?.role === 'docente',
    isEstudiante: user?.role === 'estudiante',
    isSuperadmin: user?.role === 'superadmin',
    isLoading,
    isOfflineProfile,
    mySchools,
    login,
    logout,
    refreshProfile,
    switchSchool,
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
