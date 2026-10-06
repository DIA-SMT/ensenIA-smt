/**
 * "Es mi equipo": la persona marcó al entrar que el equipo es suyo (no una
 * compu compartida de la escuela). En ese equipo la sesión del personal no
 * vence a las 12 h (AuthContext): prepara a la noche en casa y a la mañana
 * lo usa en el aula sin señal.
 */

const EQUIPO_PERSONAL_KEY = 'estudia_equipo_personal';

/** ¿Este equipo es el personal de esa cuenta (o de alguien, sin cuenta)? */
export function esEquipoPersonal(userId?: string | null): boolean {
  try {
    const duenio = localStorage.getItem(EQUIPO_PERSONAL_KEY);
    return !!duenio && (!userId || duenio === userId);
  } catch {
    return false;
  }
}

export function marcarEquipoPersonal(userId: string, personal: boolean): void {
  try {
    if (personal) localStorage.setItem(EQUIPO_PERSONAL_KEY, userId);
    else localStorage.removeItem(EQUIPO_PERSONAL_KEY);
  } catch { /* sin storage: vence como en un equipo compartido */ }
}
