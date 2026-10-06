/**
 * Cambios que todavía están solo en la pantalla (pasar lista sin guardar,
 * notas tipeadas...). Mientras haya alguno:
 *
 *   - una versión nueva de la app no recarga la página sola (main.tsx):
 *     un deploy podía borrar la lista a medio pasar;
 *   - cerrar o recargar la pestaña pide confirmación.
 *
 * Cada pantalla marca lo suyo con una clave y lo desmarca al guardar o al
 * salir (useSinGuardar).
 */

import { useEffect } from 'react';

const marcas = new Set<string>();
const alLimpiar: (() => void)[] = [];

export function marcarSinGuardar(clave: string, sucio: boolean): void {
  if (sucio) marcas.add(clave);
  else marcas.delete(clave);
  if (marcas.size === 0) alLimpiar.splice(0).forEach(fn => fn());
}

export function haySinGuardar(): boolean {
  return marcas.size > 0;
}

/** Corre fn apenas no quede nada sin guardar (ya mismo si no hay nada). */
export function cuandoNoHayaSinGuardar(fn: () => void): void {
  if (marcas.size === 0) fn();
  else alLimpiar.push(fn);
}

/** La pantalla avisa si tiene algo sin guardar; al desmontarse se desmarca. */
export function useSinGuardar(clave: string, sucio: boolean): void {
  useEffect(() => {
    marcarSinGuardar(clave, sucio);
    return () => marcarSinGuardar(clave, false);
  }, [clave, sucio]);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', e => {
    if (marcas.size === 0) return;
    e.preventDefault();
    // Algunos navegadores todavía piden returnValue para mostrar el aviso
    e.returnValue = '';
  });
}
