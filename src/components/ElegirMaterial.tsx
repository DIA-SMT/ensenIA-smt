/**
 * Elegir con qué materiales se trabaja en la clase en vivo: temas del
 * temario de esa materia y curso (con el contenido de la clase) y
 * materiales de la biblioteca del docente de esa materia. Se eligen uno o
 * varios (049); el orden en que se tocan es el orden de la clase, y en la
 * clase se pasa de uno a otro con un toque.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { X, BookOpen, FileText, Youtube, Check } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto } from './ui/Esqueleto';
import { getPlanningBySubjectAndCourse } from '../services/planning.service';
import { getMaterialsByTeacher } from '../services/library.service';
import type { EleccionMaterial } from '../services/live.service';
import type { LibraryMaterial, PlanningUnit } from '../types';
import './ElegirMaterial.css';

const idDe = (e: EleccionMaterial) => ('materialId' in e ? e.materialId : e.classId);

export default function ElegirMaterial({
  abierto, alCerrar, teacherId, subjectId, courseId, elegidos, alConfirmar,
}: {
  abierto: boolean;
  alCerrar: () => void;
  teacherId: string;
  subjectId: string;
  courseId: string;
  /** Los que la clase ya tiene, en orden */
  elegidos: EleccionMaterial[];
  alConfirmar: (lista: EleccionMaterial[]) => void;
}) {
  const [units, setUnits] = useState<PlanningUnit[] | null>(null);
  const [materiales, setMateriales] = useState<LibraryMaterial[] | null>(null);
  const [error, setError] = useState('');
  const [seleccion, setSeleccion] = useState<EleccionMaterial[]>(elegidos);

  // Cada vez que se abre, arranca con lo que la clase ya tiene
  useEffect(() => {
    if (abierto) setSeleccion(elegidos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    Promise.all([
      getPlanningBySubjectAndCourse(subjectId, courseId, teacherId),
      getMaterialsByTeacher(teacherId),
    ])
      .then(([u, m]) => {
        if (cancelado) return;
        setUnits(u);
        // Los de este curso y los de "todos mis cursos" de la materia (051)
        setMateriales(m.filter(x => x.subjectId === subjectId && (!x.courseId || x.courseId === courseId)));
      })
      .catch(err => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar el material.'); });
    return () => { cancelado = true; };
  }, [abierto, subjectId, courseId, teacherId]);

  const cargando = abierto && !error && (!units || !materiales);
  const temas = (units ?? []).filter(u => u.classes.length > 0);

  const posicion = (id: string) => seleccion.findIndex(e => idDe(e) === id);
  const alternar = (e: EleccionMaterial) => {
    const id = idDe(e);
    setSeleccion(prev => (prev.some(x => idDe(x) === id) ? prev.filter(x => idDe(x) !== id) : [...prev, e]));
  };

  /** El botón de cada opción: tocarlo la suma al final o la saca. */
  const opcion = (e: EleccionMaterial, icono: ReactNode, extra?: ReactNode) => {
    const n = posicion(idDe(e));
    const on = n >= 0;
    return (
      <button type="button" className={`elm-opcion ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => alternar(e)}>
        {on ? <span className="elm-orden" aria-label={`elegido, ${n + 1}°`}>{n + 1}</span> : icono}
        <span className="elm-opcion-texto">{e.titulo}</span>
        {extra}
        {on && <Check size={15} aria-hidden="true" />}
      </button>
    );
  };

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor="elm-titulo" className="elm-dialogo">
      <div className="dialogo-encabezado">
        <h2 id="elm-titulo">Materiales de la clase</h2>
        <button type="button" className="btn-icon" onClick={alCerrar} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="dialogo-bajada">
        Elegí uno o varios: temas de tu temario o materiales de tu biblioteca. En la clase pasás de uno a otro con un toque.
      </p>

      <div className="elm-cuerpo">
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {cargando && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando tu material…" />}

        {/* Sin nada en ninguno de los dos lados: un solo aviso, no dos */}
        {!cargando && !error && temas.length === 0 && materiales?.length === 0 && (
          <EstadoVacio
            compacto
            icono={BookOpen}
            titulo="Todavía no tenés material de esta materia"
            texto="Cargá temas en tu temario o subí algo a tu biblioteca. Mientras, la clase anda igual sin material."
          />
        )}

        {!cargando && !error && (temas.length > 0 || (materiales?.length ?? 0) > 0) && (
          <>
            <section aria-labelledby="elm-temario">
              <h3 id="elm-temario" className="elm-seccion">Del temario</h3>
              {temas.length === 0 && <p className="text-secondary text-sm">No tenés unidades cargadas para este curso.</p>}
              {temas.map(u => (
                <div key={u.id} className="elm-unidad">
                  <span className="elm-unidad-titulo">{u.title}</span>
                  <ul className="elm-lista">
                    {u.classes.map(c => (
                      <li key={c.id}>
                        {opcion(
                          { classId: c.id, titulo: c.title },
                          <BookOpen size={15} aria-hidden="true" />,
                          c.content?.trim()
                            ? <span className="badge badge-success">con contenido</span>
                            : <span className="badge badge-neutral">solo título</span>,
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section aria-labelledby="elm-biblio">
              <h3 id="elm-biblio" className="elm-seccion">De tu biblioteca</h3>
              {materiales?.length === 0 && <p className="text-secondary text-sm">No subiste materiales de esta materia.</p>}
              <ul className="elm-lista">
                {materiales?.map(m => (
                  <li key={m.id}>
                    {opcion(
                      { materialId: m.id, titulo: m.title },
                      m.videoUrl ? <Youtube size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />,
                      !m.extractedText && <span className="badge badge-neutral" title="Sin texto la IA no puede sacar preguntas">sin texto</span>,
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      <div className="elm-pie">
        {seleccion.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeleccion([])}>
            Destildar todos
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => alConfirmar(seleccion)}>
          {seleccion.length === 0
            ? (elegidos.length > 0 ? 'Trabajar sin material' : 'Listo')
            : `Listo · ${seleccion.length} ${seleccion.length === 1 ? 'material' : 'materiales'}`}
        </button>
      </div>
    </Dialogo>
  );
}
