/**
 * Instalar EstudIA como app (PWA) en el teléfono.
 *
 * Android (Chrome, Edge, Samsung) avisa UNA vez, al cargar la página, que
 * la app se puede instalar (evento beforeinstallprompt): hay que guardarlo
 * apenas llega, por eso este módulo se importa en main.tsx. Con ese evento,
 * el botón "Instalar" abre el cartel del sistema.
 *
 * iPhone no tiene ese evento: Apple solo deja instalar desde el menú
 * Compartir → "Agregar a pantalla de inicio". Ahí el botón muestra los
 * pasos. Instalada es además la única forma de que en iPhone lleguen
 * notificaciones (iOS 16.4 o más).
 */

import { useEffect, useState } from 'react';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - instalada: ya se abre como app
 * - lista: Android dio el permiso; un toque la instala
 * - ios: iPhone o iPad; hay que seguir los pasos de Compartir
 * - manual: otro navegador de celular; se instala desde su menú
 * - no: computadora sin la opción (no se ofrece nada)
 */
export type EstadoInstalacion = 'instalada' | 'lista' | 'ios' | 'manual' | 'no';

let evento: EventoInstalar | null = null;
let instaladaRecien = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // el cartel lo abrimos nosotros, cuando lo pidan
    evento = e as EventoInstalar;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    instaladaRecien = true;
    avisar();
  });
}

export function esIOS(): boolean {
  const ua = navigator.userAgent;
  // El iPad nuevo se presenta como Mac: se lo reconoce por la pantalla táctil
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const esCelular = () => matchMedia('(pointer: coarse)').matches;

export function estadoInstalacion(): EstadoInstalacion {
  const standalone = matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || instaladaRecien) return 'instalada';
  if (evento) return 'lista';
  if (esIOS()) return 'ios';
  return esCelular() ? 'manual' : 'no';
}

/** Abre el cartel de instalación del sistema (solo en estado "lista"). */
export async function instalar(): Promise<boolean> {
  if (!evento) return false;
  const e = evento;
  await e.prompt();
  const { outcome } = await e.userChoice;
  evento = null; // el mismo evento no se puede volver a usar
  avisar();
  return outcome === 'accepted';
}

export function useInstalacion(): EstadoInstalacion {
  const [estado, setEstado] = useState<EstadoInstalacion>(estadoInstalacion);
  useEffect(() => {
    const actualizar = () => setEstado(estadoInstalacion());
    oyentes.add(actualizar);
    return () => { oyentes.delete(actualizar); };
  }, []);
  return estado;
}

// La tarjeta de "Hoy" se puede cerrar; vuelve a ofrecerse a las dos semanas
const CLAVE_OCULTA = 'estudia_instalar_oculta';
const DOS_SEMANAS = 14 * 86_400_000;

export function tarjetaOculta(): boolean {
  try { return Date.now() - Number(localStorage.getItem(CLAVE_OCULTA) ?? 0) < DOS_SEMANAS; } catch { return false; }
}
export function ocultarTarjeta(): void {
  try { localStorage.setItem(CLAVE_OCULTA, String(Date.now())); } catch { /* sin almacenamiento: vuelve a aparecer */ }
}
