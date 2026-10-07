/**
 * La dirección pública de la app: la que va en los QR, en los enlaces para
 * entrar a una clase en vivo y en las credenciales impresas.
 *
 * No sale de window.location: la app también responde en direcciones viejas
 * (ensenia-aula.vercel.app) y en las de prueba de Vercel, y lo que se
 * proyecta o se imprime tiene que mandar siempre a la de la Municipalidad.
 * En la compu de desarrollo se usa la local, para poder probar.
 */

const PUBLICA = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/+$/, '') || 'https://estudia.smt.gob.ar';

const esLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/** "https://estudia.smt.gob.ar" (o la local, en desarrollo). */
export function origenPublico(): string {
  return esLocal(window.location.hostname) ? window.location.origin : PUBLICA;
}

/** Enlace completo a una ruta de la app: enlacePublico('/vivo/ABC123'). */
export function enlacePublico(ruta: string): string {
  return `${origenPublico()}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

/** Solo el nombre, para leerlo en voz alta o imprimirlo: "estudia.smt.gob.ar". */
export function hostPublico(): string {
  return new URL(origenPublico()).host;
}
