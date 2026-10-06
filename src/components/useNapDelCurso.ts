/**
 * Los NAP de una materia+curso, para la planificación del docente: el
 * área (nombre de la materia) y el año del curso, los NAP publicados que
 * aplican, y qué NAP tiene vinculado cada tema de sus unidades.
 *
 * Lo comparten el bloque "NAP que trabaja este tema" y la cobertura del
 * año: vincular en un tema actualiza la cobertura sin recargar la pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getContextoNap, getNapDelArea, getVinculosNap,
  type NapFragmento, type VinculoNap,
} from '../services/nap.service';
import { avisar } from './ui/avisar';
import type { PlanningUnit } from '../types';

export interface NapDelCurso {
  area: string | null;
  anio: number | null;
  /** null mientras carga. */
  napDelAnio: NapFragmento[] | null;
  vinculos: VinculoNap[];
  error: boolean;
  recargarVinculos: () => Promise<void>;
}

export function useNapDelCurso(subjectId: string, courseId: string, units: PlanningUnit[] | null): NapDelCurso {
  const [contexto, setContexto] = useState<{ area: string | null; anio: number | null }>({ area: null, anio: null });
  const [napDelAnio, setNapDelAnio] = useState<NapFragmento[] | null>(null);
  const [vinculos, setVinculos] = useState<VinculoNap[]>([]);
  const [error, setError] = useState(false);

  const unitIds = (units ?? []).map(u => u.id);
  const claveUnidades = unitIds.join(',');
  const clave = `${subjectId}|${courseId}|${claveUnidades}`;
  const claveActual = useRef(clave);
  claveActual.current = clave;
  const unitIdsRef = useRef(unitIds);
  unitIdsRef.current = unitIds;

  // Área, año y NAP: dependen solo de la materia y el curso.
  useEffect(() => {
    let cancelado = false;
    setNapDelAnio(null);
    setVinculos([]);
    setError(false);
    getContextoNap(subjectId, courseId)
      .then(async ctx => {
        const nap = await getNapDelArea(ctx.area, ctx.anio);
        if (cancelado) return;
        setContexto(ctx);
        setNapDelAnio(nap);
      })
      .catch(err => {
        console.error(err);
        if (cancelado) return;
        setNapDelAnio([]);
        setError(true);
        avisar.error('No se pudieron cargar los NAP de la materia.', 'El temario y los criterios funcionan igual.');
      });
    return () => { cancelado = true; };
  }, [subjectId, courseId]);

  // Vínculos: cambian con las unidades (el temario se recarga al moverlas).
  useEffect(() => {
    if (units === null) return;
    let cancelado = false;
    getVinculosNap(claveUnidades ? claveUnidades.split(',') : [])
      .then(v => { if (!cancelado) setVinculos(v); })
      .catch(err => { console.error(err); if (!cancelado) setError(true); });
    return () => { cancelado = true; };
    // `units` entra por su clave: un array nuevo con las mismas unidades no recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, courseId, claveUnidades, units === null]);

  const recargarVinculos = useCallback(async () => {
    const mia = claveActual.current;
    const v = await getVinculosNap(unitIdsRef.current);
    if (claveActual.current === mia) setVinculos(v);
  }, []);

  return { ...contexto, napDelAnio, vinculos, error, recargarVinculos };
}
