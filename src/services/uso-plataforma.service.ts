/**
 * Uso de la plataforma (superadmin): quién entra, qué hace cada docente y
 * qué herramientas se usan. Lo calcula la base (uso_plataforma, 065); por
 * persona solo viene el personal, los estudiantes vienen contados.
 */

import { supabase } from './_helpers';

/** Lo que se cuenta de cada docente. Las claves las define la 065. */
export type Herramienta =
  | 'actividades' | 'correcciones' | 'clases_en_vivo' | 'asistencia' | 'evaluaciones'
  | 'materiales' | 'clases_enviadas' | 'planificacion' | 'migue' | 'ia';

export type ConteoHerramientas = Partial<Record<Herramienta, number>>;

export interface UsoPlataforma {
  desde: string;
  hasta: string;
  dias: number;
  /** Desde cuándo hay registro de ingresos (la mudanza al servidor propio) */
  ingresos_desde: string | null;
  totales: {
    personal_total: number;
    personal_activo: number;
    personal_nunca: number;
    alumnos_total: number;
    alumnos_activos: number;
    entregas: number;
    usos_ia: number;
    costo_ia_usd: number | null;
  };
  por_dia: { dia: string; personal: number; estudiantes: number; familias: number }[];
  por_escuela: {
    escuela: string;
    personal_total: number;
    personal_activo: number;
    personal_nunca: number;
    alumnos_total: number;
    alumnos_activos: number;
    entregas: number;
    usos_ia: number;
    costo_ia_usd: number | null;
    herramientas: ConteoHerramientas;
  }[];
  herramientas: { herramienta: Herramienta; usos: number; personas: number }[];
  por_persona: {
    nombre: string;
    escuelas: string | null;
    rol: 'docente' | 'director';
    ultimo_ingreso: string | null;
    dias_activo: number;
    usos_ia: number;
    herramientas: ConteoHerramientas;
    total: number;
  }[];
}

export async function getUsoPlataforma(dias: number): Promise<UsoPlataforma> {
  const { data, error } = await supabase.rpc('uso_plataforma', { p_days: dias });
  if (error) {
    // Sin la migración 065 la función no existe: que se entienda qué falta
    if (error.code === 'PGRST202') {
      throw new Error('Falta correr la migración 065 (uso de la plataforma) en la base.');
    }
    throw new Error(error.message);
  }
  return data as unknown as UsoPlataforma;
}
