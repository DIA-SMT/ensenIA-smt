import type { UserRole } from '../types';

/**
 * Pantalla de inicio de cada rol. Una sola lista: la usaban por separado
 * App (la raíz) y ProtectedRoute (al rebotar de una ruta ajena), y un rol
 * que faltara en una caía en '/panel', que es del director, y rebotaba
 * contra sí mismo para siempre.
 */
export function homeFor(role: UserRole | undefined): string {
  switch (role) {
    case 'estudiante': return '/mis-actividades';
    case 'padre': return '/mis-hijos';
    case 'docente': return '/hoy';
    case 'superadmin': return '/admin';
    default: return '/panel';
  }
}
