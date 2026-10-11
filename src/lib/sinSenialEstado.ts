/**
 * El estado de "listo para usar sin señal" (sin-senial.service), aparte y
 * liviano: AuthContext lo borra al cerrar sesión (o cuando entra otra
 * persona) sin cargar el servicio entero, y corta una descarga en curso
 * para que no escriba nada a nombre de quien se fue.
 */

export const ESTADO_SIN_SENIAL_KEY = 'estudia_sin_senial';

let generacion = 0;

/** Cambia cada vez que se cierra sesión: una descarga vieja no guarda su estado. */
export function generacionSinSenial(): number {
  return generacion;
}

export function olvidarSinSenial(): void {
  generacion++;
  try { localStorage.removeItem(ESTADO_SIN_SENIAL_KEY); } catch { /* sin storage */ }
}
