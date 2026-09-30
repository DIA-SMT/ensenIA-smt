/**
 * SMT EstudIA — Preferencias de lectura y de datos
 *
 * Cuatro ajustes que cada persona elige para SU dispositivo:
 *
 *   - Tamaño de letra: toda la app escala (los tamaños están en rem).
 *   - Contraste alto: textos secundarios más oscuros, bordes marcados y
 *     enlaces subrayados.
 *   - Movimiento: "reducido" apaga animaciones. Si el sistema operativo ya
 *     lo pide, se respeta sin tocar nada.
 *   - Ahorro de datos: la app no anticipa pantallas en segundo plano y avisa
 *     antes de abrir algo pesado, como un video. En "automático" se prende
 *     solo si el celular tiene activado el ahorro de datos.
 *
 * Se guardan en el dispositivo (no en la cuenta): en una compu compartida
 * de la escuela, la letra grande de un chico no le cambia la pantalla al
 * siguiente. Si el navegador no deja guardar, se usan los valores por
 * defecto y todo sigue funcionando.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type TamanoLetra = 'normal' | 'grande' | 'muy-grande';
export type Contraste = 'normal' | 'alto';
export type Movimiento = 'auto' | 'reducido';
export type AhorroDatos = 'auto' | 'si' | 'no';

export interface Preferencias {
  letra: TamanoLetra;
  contraste: Contraste;
  movimiento: Movimiento;
  ahorro: AhorroDatos;
}

const POR_DEFECTO: Preferencias = { letra: 'normal', contraste: 'normal', movimiento: 'auto', ahorro: 'auto' };
const CLAVE = 'estudia_preferencias_v1';

interface ConexionNavegador { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, fn: () => void) => void; removeEventListener?: (t: string, fn: () => void) => void }

function conexion(): ConexionNavegador | undefined {
  return (navigator as Navigator & { connection?: ConexionNavegador }).connection;
}

/** El sistema pide ahorrar: modo ahorro del celular o red 2G. */
function sistemaPideAhorro(): boolean {
  const c = conexion();
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

function leer(): Preferencias {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return POR_DEFECTO;
    const p = JSON.parse(crudo) as Partial<Preferencias>;
    return {
      letra: p.letra === 'grande' || p.letra === 'muy-grande' ? p.letra : 'normal',
      contraste: p.contraste === 'alto' ? 'alto' : 'normal',
      movimiento: p.movimiento === 'reducido' ? 'reducido' : 'auto',
      ahorro: p.ahorro === 'si' || p.ahorro === 'no' ? p.ahorro : 'auto',
    };
  } catch {
    return POR_DEFECTO;
  }
}

interface PreferencesContextType {
  preferencias: Preferencias;
  cambiar: <K extends keyof Preferencias>(clave: K, valor: Preferencias[K]) => void;
  restablecer: () => void;
  /** Si el ahorro de datos está activo ahora mismo (elegido o pedido por el sistema). */
  ahorroActivo: boolean;
  /** Si el sistema operativo o el navegador ya piden ahorrar datos. */
  sistemaAhorra: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferencias, setPreferencias] = useState<Preferencias>(leer);
  const [sistemaAhorra, setSistemaAhorra] = useState(sistemaPideAhorro);

  // El celular puede prender o apagar el ahorro de datos con la app abierta.
  useEffect(() => {
    const c = conexion();
    if (!c?.addEventListener) return;
    const alCambiar = () => setSistemaAhorra(sistemaPideAhorro());
    c.addEventListener('change', alCambiar);
    return () => c.removeEventListener?.('change', alCambiar);
  }, []);

  // Las preferencias viven como atributos en <html>: el CSS hace el resto.
  // Antes de pintar, para que la letra grande no aparezca con un salto.
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.letra = preferencias.letra;
    raiz.dataset.contraste = preferencias.contraste;
    raiz.dataset.movimiento = preferencias.movimiento;
    try { localStorage.setItem(CLAVE, JSON.stringify(preferencias)); } catch { /* sin storage */ }
  }, [preferencias]);

  const ahorroActivo = preferencias.ahorro === 'si' || (preferencias.ahorro === 'auto' && sistemaAhorra);

  useLayoutEffect(() => {
    document.documentElement.dataset.ahorro = ahorroActivo ? 'si' : 'no';
  }, [ahorroActivo]);

  const cambiar = useCallback(<K extends keyof Preferencias>(clave: K, valor: Preferencias[K]) => {
    setPreferencias(p => ({ ...p, [clave]: valor }));
  }, []);

  const restablecer = useCallback(() => setPreferencias(POR_DEFECTO), []);

  const value = useMemo(
    () => ({ preferencias, cambiar, restablecer, ahorroActivo, sistemaAhorra }),
    [preferencias, cambiar, restablecer, ahorroActivo, sistemaAhorra],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferencias(): PreferencesContextType {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferencias fuera de PreferencesProvider');
  return ctx;
}
