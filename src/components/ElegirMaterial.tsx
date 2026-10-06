/**
 * Elegir con qué material se trabaja en la clase en vivo: un tema del
 * temario de esa materia y curso (con el contenido de la clase) o un
 * material de la biblioteca del docente de esa materia.
 */

import { useEffect, useState } from 'react';
import { X, BookOpen, FileText, Youtube, Check } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto } from './ui/Esqueleto';
import { getPlanningBySubjectAndCourse } from '../services/planning.service';
import { getMaterialsByTeacher } from '../services/library.service';
import type { LibraryMaterial, PlanningUnit } from '../types';
import './ElegirMaterial.css';

export type EleccionMaterial =
  | { materialId: string; titulo: string }
  | { classId: string; titulo: string };

export default function ElegirMaterial({
  abierto, alCerrar, teacherId, subjectId, courseId, actual, alElegir,
}: {
  abierto: boolean;
  alCerrar: () => void;
  teacherId: string;
  subjectId: string;
  courseId: string;
  /** id del material o tema elegido ahora */
  actual: string | null;
  alElegir: (e: EleccionMaterial | null) => void;
}) {
  const [units, setUnits] = useState<PlanningUnit[] | null>(null);
  const [materiales, setMateriales] = useState<LibraryMaterial[] | null>(null);
  const [error, setError] = useState('');

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
        setMateriales(m.filter(x => x.subjectId === subjectId));
      })
      .catch(err => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar el material.'); });
    return () => { cancelado = true; };
  }, [abierto, subjectId, courseId, teacherId]);

  const cargando = abierto && !error && (!units || !materiales);
  const temas = (units ?? []).filter(u => u.classes.length > 0);

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor="elm-titulo" className="elm-dialogo">
      <div className="dialogo-encabezado">
        <h2 id="elm-titulo">Material de la clase</h2>
        <button type="button" className="btn-icon" onClick={alCerrar} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="dialogo-bajada">Elegí un tema de tu temario o un material de tu biblioteca para trabajar hoy.</p>

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
                        <button type="button" className={`elm-opcion ${actual === c.id ? 'on' : ''}`}
                          aria-pressed={actual === c.id}
                          onClick={() => alElegir({ classId: c.id, titulo: c.title })}>
                          <BookOpen size={15} aria-hidden="true" />
                          <span className="elm-opcion-texto">{c.title}</span>
                          {c.content?.trim()
                            ? <span className="badge badge-success">con contenido</span>
                            : <span className="badge badge-neutral">solo título</span>}
                          {actual === c.id && <Check size={15} aria-label="elegido" />}
                        </button>
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
                    <button type="button" className={`elm-opcion ${actual === m.id ? 'on' : ''}`}
                      aria-pressed={actual === m.id}
                      onClick={() => alElegir({ materialId: m.id, titulo: m.title })}>
                      {m.videoUrl ? <Youtube size={15} aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
                      <span className="elm-opcion-texto">{m.title}</span>
                      {!m.extractedText && <span className="badge badge-neutral" title="Sin texto la IA no puede sacar preguntas">sin texto</span>}
                      {actual === m.id && <Check size={15} aria-label="elegido" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>

      {actual && (
        <div className="elm-pie">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => alElegir(null)}>
            Trabajar sin material
          </button>
        </div>
      )}
    </Dialogo>
  );
}
