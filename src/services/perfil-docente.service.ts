/**
 * El perfil del docente (070): su presentación, formación, logros y lo que
 * hizo en la app. Lo edita solo el docente; la dirección lo lee si él lo
 * compartió (la base lo hace cumplir, no esta pantalla).
 */

import { supabase, unwrap } from './_helpers';
import type { AntecedenteDocente, PerfilDocente, RecorridoEnEstudia, TipoAntecedente } from '../types';

type FilaPerfil = {
  user_id: string; sobre_mi: string; docente_desde: number | null;
  intereses: string[] | null; compartir_con_direccion: boolean;
};

type FilaAntecedente = {
  id: string; user_id: string; tipo: TipoAntecedente; titulo: string; institucion: string;
  anio: number | null; horas: number | null; detalle: string;
};

const aPerfil = (f: FilaPerfil): PerfilDocente => ({
  userId: f.user_id,
  sobreMi: f.sobre_mi ?? '',
  docenteDesde: f.docente_desde,
  intereses: f.intereses ?? [],
  compartirConDireccion: f.compartir_con_direccion,
});

const aAntecedente = (f: FilaAntecedente): AntecedenteDocente => ({
  id: f.id,
  userId: f.user_id,
  tipo: f.tipo,
  titulo: f.titulo,
  institucion: f.institucion ?? '',
  anio: f.anio,
  horas: f.horas,
  detalle: f.detalle ?? '',
});

/** El perfil de alguien, o null si no lo cargó (o si no lo compartió con quien pregunta). */
export async function getPerfilDocente(userId: string): Promise<PerfilDocente | null> {
  const { data, error } = await supabase
    .from('perfil_docente' as never)
    .select('user_id, sobre_mi, docente_desde, intereses, compartir_con_direccion')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? aPerfil(data as unknown as FilaPerfil) : null;
}

export async function guardarPerfilDocente(p: PerfilDocente): Promise<PerfilDocente> {
  const fila = unwrap(
    await supabase
      .from('perfil_docente' as never)
      .upsert({
        user_id: p.userId,
        sobre_mi: p.sobreMi.trim().slice(0, 600),
        docente_desde: p.docenteDesde,
        intereses: p.intereses.slice(0, 12),
        compartir_con_direccion: p.compartirConDireccion,
      } as never, { onConflict: 'user_id' })
      .select('user_id, sobre_mi, docente_desde, intereses, compartir_con_direccion')
      .single(),
  );
  return aPerfil(fila as unknown as FilaPerfil);
}

/** Los antecedentes de alguien: lo más nuevo primero dentro de cada tipo. */
export async function getAntecedentes(userId: string): Promise<AntecedenteDocente[]> {
  const filas = unwrap(
    await supabase
      .from('antecedentes_docente' as never)
      .select('id, user_id, tipo, titulo, institucion, anio, horas, detalle')
      .eq('user_id', userId)
      .order('anio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  );
  return (filas as unknown as FilaAntecedente[]).map(aAntecedente);
}

/** Alta o cambio de un antecedente (sin id: alta). */
export async function guardarAntecedente(a: Omit<AntecedenteDocente, 'id'> & { id?: string }): Promise<AntecedenteDocente> {
  const fila = {
    user_id: a.userId,
    tipo: a.tipo,
    titulo: a.titulo.trim().slice(0, 200),
    institucion: a.institucion.trim().slice(0, 200),
    anio: a.anio,
    horas: a.tipo === 'capacitacion' ? a.horas : null,
    detalle: a.detalle.trim().slice(0, 500),
  };
  const consulta = a.id
    ? supabase.from('antecedentes_docente' as never).update(fila as never).eq('id', a.id)
    : supabase.from('antecedentes_docente' as never).insert(fila as never);
  const guardada = unwrap(await consulta.select('id, user_id, tipo, titulo, institucion, anio, horas, detalle').single());
  return aAntecedente(guardada as unknown as FilaAntecedente);
}

export async function borrarAntecedente(id: string): Promise<void> {
  const { error } = await supabase.from('antecedentes_docente' as never).delete().eq('id', id);
  if (error) throw error;
}

/** Lo que hizo en la app este año, contado con sus propios permisos. */
export async function getMiRecorrido(): Promise<RecorridoEnEstudia | null> {
  const { data, error } = await supabase.rpc('mi_recorrido_en_estudia' as never);
  if (error) throw error;
  return (data as unknown as RecorridoEnEstudia | null) ?? null;
}
