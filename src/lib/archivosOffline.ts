/**
 * Bajar por adelantado los archivos de un material, para verlo sin señal.
 *
 * Los datos del material (texto, láminas, juego) viajan en la fila y ya los
 * guarda el service worker. Lo que faltaba son los ARCHIVOS: las imágenes de
 * las láminas, el PNG del diagrama, el PDF. Acá se piden una vez con señal;
 * el service worker se queda con la copia (caché supabase-storage, buscada
 * sin el token) y getSignedUrl la usa cuando no hay conexión.
 */

import { getSignedUrl, urlSinFirma } from '../services/documents.service';
import { haySenial } from './conexion';
import { mazoDe } from './mazoDe';
import type { LibraryMaterial } from '../types';

/** Un PDF más grande que esto no se baja "por las dudas": ocupa el celular. */
const PDF_MAXIMO = 8 * 1024 * 1024;

/**
 * Las rutas de los archivos que hacen falta para mostrar estos materiales.
 * Imágenes siempre (son livianas); PDF solo si se pide y no es enorme.
 */
export function archivosDe(materiales: LibraryMaterial[], opciones: { conPdf?: boolean } = {}): string[] {
  const rutas = new Set<string>();
  for (const m of materiales) {
    for (const dia of mazoDe(m)?.diapositivas ?? []) {
      if (dia.imagen?.ruta) rutas.add(dia.imagen.ruta);
    }
    if (!m.storagePath) continue;
    if (m.fileType === 'image') rutas.add(m.storagePath);
    else if (opciones.conPdf && m.fileType === 'pdf' && (m.fileSizeBytes ?? 0) <= PDF_MAXIMO) rutas.add(m.storagePath);
  }
  return [...rutas];
}

/**
 * ¿Este navegador guarda copias para usar sin conexión? Hace falta el
 * service worker activo (no lo hay en desarrollo ni en algunos navegadores
 * viejos): sin él, "guardar" no guardaría nada.
 */
export function puedeGuardarSinConexion(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
    && 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
}

/** ¿Ya está guardado en este equipo? Así no se vuelve a pedir la firma. */
export async function yaGuardado(ruta: string): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    return Boolean(await caches.match(urlSinFirma(ruta), { ignoreSearch: true }));
  } catch {
    return false;
  }
}

/**
 * Baja los archivos que falten, de a dos (el wifi de la escuela es poco).
 * Devuelve cuántos no se pudieron bajar (todos, si no hay señal o el
 * navegador no puede guardar).
 */
export async function guardarArchivos(rutas: string[], alAvanzar?: (hechos: number, total: number) => void): Promise<{ fallaron: number }> {
  if (!haySenial() || !puedeGuardarSinConexion()) {
    return { fallaron: rutas.length };
  }
  let hechos = 0;
  let fallaron = 0;
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < rutas.length) {
      const ruta = rutas[siguiente++];
      try {
        if (!(await yaGuardado(ruta))) {
          const resp = await fetch(await getSignedUrl(ruta));
          if (!resp.ok) fallaron++;
          // El cuerpo se descarta: alcanza con que pase por el service worker
          await resp.arrayBuffer().catch(() => undefined);
        }
      } catch {
        fallaron++;
      }
      alAvanzar?.(++hechos, rutas.length);
    }
  };
  await Promise.all([trabajador(), trabajador()]);
  return { fallaron };
}
