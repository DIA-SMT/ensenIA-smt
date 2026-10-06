/**
 * Qué repasar (docente): los temas que al curso le costaron, sacados de las
 * respuestas a actividades y a las preguntas rápidas de la clase en vivo.
 * Solo números del curso, nunca nombres. Cada tema dice qué porcentaje
 * acertó, cuáles fueron las preguntas más flojas y qué respuesta equivocada
 * se eligió más, con atajos para ir a la actividad o repasarlo en vivo.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CircleCheck, ClipboardList, Radio, Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import {
  getComprension, agruparPorTema, MIN_RESPUESTAS, UMBRAL_ACIERTO,
  type Comprension, type TemaRepaso,
} from '../services/comprension.service';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto } from './ui/Esqueleto';
import { avisar } from './ui/avisar';
import './ui/ui.css';
import './QueRepasar.css';

const DIAS = 60;

interface Props {
  /** Versión corta (para el inicio): menos temas y menos preguntas por tema. */
  compacto?: boolean;
}

const fechaCorta = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';

export default function QueRepasar({ compacto = false }: Props) {
  const { user } = useAuth();
  const asignaciones = useMemo(() => user?.subjects ?? [], [user?.subjects]);
  const [elegido, setElegido] = useState('');
  const [materias, setMaterias] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ clave: string; datos: Comprension | null } | null>(null);

  const teacherId = user?.id;
  const schoolId = user?.schoolId;

  useEffect(() => {
    if (!teacherId) return;
    let vigente = true;
    getSubjects(schoolId)
      .then(lista => {
        if (!vigente) return;
        const mapa: Record<string, string> = {};
        lista.forEach(s => { mapa[s.id] = s.name; });
        setMaterias(mapa);
      })
      .catch(console.error);
    return () => { vigente = false; };
  }, [teacherId, schoolId]);

  // '' = todos los cursos; si no, el índice de la asignación
  const asignacion = elegido === '' ? undefined : asignaciones[Number(elegido)];
  const clave = `${teacherId ?? ''}|${asignacion?.subjectId ?? ''}|${asignacion?.courseId ?? ''}`;

  useEffect(() => {
    if (!teacherId) return;
    let vigente = true;
    getComprension(teacherId, { subjectId: asignacion?.subjectId, courseId: asignacion?.courseId, dias: DIAS })
      .then(datos => { if (vigente) setResultado({ clave, datos }); })
      .catch(err => {
        console.error(err);
        if (!vigente) return;
        setResultado({ clave, datos: null });
        avisar.error('No se pudo armar el repaso.', 'Revisá la conexión y probá de nuevo.');
      });
    return () => { vigente = false; };
    // clave resume teacherId + asignación
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const cargando = !resultado || resultado.clave !== clave;
  const datos = cargando ? null : resultado.datos;
  const temas = useMemo(() => (datos ? agruparPorTema(datos.puntos) : []), [datos]);

  if (!user) return null;

  const nombreCurso = (subjectId: string, courseId: string) => {
    const a = asignaciones.find(x => x.subjectId === subjectId && x.courseId === courseId);
    const materia = materias[subjectId];
    return [materia, a?.courseName].filter(Boolean).join(' · ');
  };

  const maxTemas = compacto ? 3 : 12;
  const maxPreguntas = compacto ? 2 : 3;
  const visibles = temas.slice(0, maxTemas);

  return (
    <section className={`repaso${compacto ? ' repaso-compacto' : ''}`} aria-labelledby="repaso-titulo">
      <header className="repaso-cabecera">
        <div className="repaso-cabecera-textos">
          <h2 id="repaso-titulo" className="repaso-titulo">
            <Target size={20} aria-hidden="true" /> Qué repasar
          </h2>
          <p className="repaso-bajada">
            Las preguntas que más le costaron al curso en los últimos {DIAS} días, por tema.
          </p>
        </div>
        {asignaciones.length > 1 && (
          <div className="repaso-filtro">
            <label htmlFor="repaso-curso">Curso</label>
            <select
              id="repaso-curso"
              className="form-select"
              value={elegido}
              onChange={e => setElegido(e.target.value)}
            >
              <option value="">Todos mis cursos</option>
              {asignaciones.map((a, i) => (
                <option key={`${a.subjectId}:${a.courseId}`} value={String(i)}>
                  {materias[a.subjectId] ? `${materias[a.subjectId]} · ` : ''}{a.courseName}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {cargando ? (
        <Esqueleto tipo="tarjetas" cantidad={compacto ? 2 : 3} etiqueta="Buscando qué le costó al curso…" />
      ) : !datos ? (
        <EstadoVacio
          compacto
          icono={ClipboardList}
          titulo="No pudimos armar el repaso"
          texto="Puede ser la conexión. Volvé a entrar en un rato."
        />
      ) : datos.preguntasAnalizadas === 0 ? (
        <EstadoVacio
          compacto={compacto}
          icono={BookOpenCheck}
          titulo="Todavía no hay respuestas para analizar"
          texto={
            <>
              Esto se va llenando solo a medida que tus estudiantes responden actividades con opción
              múltiple y preguntas rápidas en la clase en vivo (desde {MIN_RESPUESTAS} respuestas por pregunta).
            </>
          }
          accion={{ etiqueta: 'Crear una actividad', a: '/crear' }}
        />
      ) : temas.length === 0 ? (
        <EstadoVacio
          compacto={compacto}
          icono={CircleCheck}
          titulo="¡Vienen bien!"
          texto={`Revisamos ${datos.preguntasAnalizadas} ${datos.preguntasAnalizadas === 1 ? 'pregunta' : 'preguntas'} y en todas acertó al menos el ${UMBRAL_ACIERTO} % del curso.`}
        />
      ) : (
        <>
          <p className="repaso-resumen">
            {temas.length === 1 ? 'Hay 1 tema' : `Hay ${temas.length} temas`} para volver a ver
            {temas.length > visibles.length ? ` (te mostramos los ${visibles.length} más flojos)` : ''}.
          </p>
          <ul className="repaso-lista">
            {visibles.map(t => (
              <TarjetaTema
                key={t.clave}
                tema={t}
                curso={elegido === '' ? nombreCurso(t.subjectId, t.courseId) : ''}
                maxPreguntas={maxPreguntas}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TarjetaTema({ tema: t, curso, maxPreguntas }: { tema: TemaRepaso; curso: string; maxPreguntas: number }) {
  const nivel = t.porcentaje < 40 ? 'bajo' : 'medio';
  const tituloId = `repaso-tema-${t.clave.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const preguntas = t.preguntas.slice(0, maxPreguntas);
  const resto = t.preguntas.length - preguntas.length;

  return (
    <li className={`repaso-tema repaso-tema-${nivel}`}>
      <article aria-labelledby={tituloId}>
        <div className="repaso-tema-cabeza">
          <h3 id={tituloId} className="repaso-tema-titulo">{t.tema}</h3>
          <p className="repaso-tema-meta">
            {[curso, t.unidad, fechaCorta(t.fecha)].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="repaso-medida">
          <p className="repaso-medida-texto">
            <strong>Acertó el {t.porcentaje} %</strong>
            <span> · {t.preguntas.length === 1 ? '1 pregunta floja' : `${t.preguntas.length} preguntas flojas`}</span>
          </p>
          <div className="repaso-barra" aria-hidden="true">
            <span style={{ width: `${Math.max(t.porcentaje, 3)}%` }} />
          </div>
        </div>

        <ul className="repaso-preguntas">
          {preguntas.map(p => (
            <li key={p.clave} className="repaso-pregunta">
              <p className="repaso-pregunta-texto">{p.pregunta}</p>
              <p className="repaso-pregunta-dato">
                <span className={`repaso-fuente repaso-fuente-${p.fuente}`}>
                  {p.fuente === 'vivo' ? 'Clase en vivo' : 'Actividad'}
                </span>
                <span>{p.aciertos} de {p.respuestas} acertaron</span>
              </p>
              {p.errorFrecuente && (
                <p className="repaso-pregunta-error">
                  La respuesta equivocada más elegida: <q>{p.errorFrecuente.opcion}</q> ({p.errorFrecuente.veces})
                </p>
              )}
            </li>
          ))}
        </ul>
        {resto > 0 && (
          <p className="repaso-resto">Y {resto === 1 ? 'otra pregunta' : `${resto} preguntas más`} de este tema.</p>
        )}

        <div className="repaso-acciones">
          {t.enlaceActividad && (
            <Link to={t.enlaceActividad} className="btn btn-outline btn-sm">
              <ClipboardList size={16} aria-hidden="true" /> Ver la actividad
            </Link>
          )}
          <Link to="/clase-en-vivo" className="btn btn-primary btn-sm">
            <Radio size={16} aria-hidden="true" /> Repasar en la clase en vivo
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </article>
    </li>
  );
}
