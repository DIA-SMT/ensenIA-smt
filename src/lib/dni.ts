/**
 * Entrar con el DNI.
 *
 * Muchos alumnos no tienen email (o no lo usan), así que su cuenta es
 * <dni>@DNI_EMAIL_DOMAIN: la crea la función admin-usuarios y el login la
 * arma igual a partir de lo que escriben. Nunca se manda un mail a esas
 * direcciones.
 *
 * El dominio tiene que coincidir con ALUMNOS_EMAIL_DOMAIN de la función.
 */

export const DNI_EMAIL_DOMAIN: string =
  import.meta.env.VITE_DNI_EMAIL_DOMAIN || 'alumnos.estudia.smt.gob.ar';

/** "45.123.456" o "45123456" → cuenta por DNI; cualquier otra cosa se usa como email. */
export function toLoginEmail(input: string): string {
  const value = input.trim().toLowerCase();
  if (value.includes('@')) return value;
  const digits = value.replace(/[.\s-]/g, '');
  return /^\d{6,9}$/.test(digits) ? `${digits}@${DNI_EMAIL_DOMAIN}` : value;
}

/** Lo que se muestra como "usuario": el DNI si la cuenta es por DNI. */
export function loginLabel(email: string, dni?: string | null): string {
  if (dni) return dni;
  return email.endsWith(`@${DNI_EMAIL_DOMAIN}`) ? email.split('@')[0] : email;
}
