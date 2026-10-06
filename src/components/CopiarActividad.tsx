/**
 * SMT EstudIA — Copiar una actividad a otro curso
 *
 * El mismo docente suele tener la misma materia en varios cursos: armar la
 * actividad una vez y mandarla a los demás. Las copias salen publicadas
 * (como toda actividad nueva) con el mismo título, consigna, preguntas y
 * puntaje; sin clase ni unidad, que son de la planificación de cada curso.
 *
 *   <BotonCopiarActividad activity={a} />            // botón + diálogo
 *   <BotonCopiarActividad activity={a} compacto />   // solo ícono (listas)
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, X, Check, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { avisar, confirmar } from './ui/avisar';
import { Cargando } from './ui/Esqueleto';
import { useAuth } from '../contexts/AuthContext';
import { createActivity } from '../services/activities.service';
import { getSubjects } from '../services/subjects.service';
import type { Activity, SubjectAssignment } from '../types';
import './Modals.css';
import './CopiarActividad.css';

const claveDe = (a: { subjectId: string; courseId: string }) => `${a.subjectId}:${a.courseId}`;

interface Resultado {
  clave: string;
  etiqueta: string;
  /** id de la copia creada, o null si falló. */
  id: string | null;
}

/** Fin del día elegido, en la hora local (igual que las fechas de ActividadRapida). */
function finDelDia(fecha: string): string | null {
  if (!fecha) return null;
  const d = new Date(`${fecha}T23:59:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function hoyLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface DialogoProps {
  activity: Activity;
  /** Asignaciones a las que se puede copiar (ya sin la de la actividad). */
  destinos: SubjectAssignment[];
  alCerrar: () => void;
  /** Se llama si se creó al menos una copia (para refrescar una lista). */
  alCopiar?: () => void;
}

function DialogoCopiar({ activity, destinos, alCerrar, alCopiar }: DialogoProps) {
  const { user } = useAuth();
  const [materias, setMaterias] = useState<Record<string, string>>({});
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [fecha, setFecha] = useState('');
  const [copiando, setCopiando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let vigente = true;
    getSubjects(user.schoolId)
      .then(list => { if (vigente) setMaterias(Object.fromEntries(list.map(s => [s.id, s.name]))); })
      .catch(console.error);
    return () => { vigente = false; };
  }, [user]);

  // La misma materia primero (lo más común), después el resto
  const opciones = useMemo(() => {
    const nombre = (id: string) => materias[id] ?? (id === activity.subjectId ? activity.subjectName ?? '' : '');
    return destinos
      .map(d => ({
        ...d,
        clave: claveDe(d),
        etiqueta: `${nombre(d.subjectId) || 'Materia'} — ${d.courseName}`,
        misma: d.subjectId === activity.subjectId,
      }))
      .sort((a, b) =>
        Number(b.misma) - Number(a.misma)
        || a.etiqueta.localeCompare(b.etiqueta, 'es'));
  }, [destinos, materias, activity.subjectId, activity.subjectName]);

  const hayMisma = opciones.some(o => o.misma);
  const hayOtras = opciones.some(o => !o.misma);

  const alternar = (clave: string) => {
    setElegidas(prev => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave); else next.add(clave);
      return next;
    });
  };

  const copiar = async (claves: string[]) => {
    if (!user || claves.length === 0 || copiando) return;
    setCopiando(true);
    const dueDate = finDelDia(fecha);
    const nuevos: Resultado[] = [];
    // De a una: si algo falla, el resto sigue y se sabe cuál quedó afuera
    for (const clave of claves) {
      const o = opciones.find(x => x.clave === clave);
      if (!o) continue;
      try {
        const copia = await createActivity({
          title: activity.title,
          description: activity.description,
          contentMd: activity.contentMd,
          questions: activity.questions,
          subjectId: o.subjectId,
          courseId: o.courseId,
          teacherId: user.id,
          schoolId: user.schoolId,
          // Clase y unidad son de la planificación del curso original
          unitId: null,
          classId: null,
          sourceTool: activity.sourceTool ?? null,
          dueDate,
          points: activity.points ?? null,
        });
        nuevos.push({ clave, etiqueta: o.etiqueta, id: copia.id });
      } catch (err) {
        console.error('Copiar actividad:', err);
        nuevos.push({ clave, etiqueta: o.etiqueta, id: null });
      }
    }
    // Un reintento reemplaza el resultado anterior de esos cursos
    setResultados(prev => [...(prev ?? []).filter(r => !claves.includes(r.clave)), ...nuevos]);
    setCopiando(false);

    const ok = nuevos.filter(r => r.id).length;
    const mal = nuevos.length - ok;
    if (ok > 0) alCopiar?.();
    if (ok > 0 && mal === 0) {
      avisar.exito(`Copiada a ${ok} curso${ok !== 1 ? 's' : ''}`, 'Ya están publicadas: las ves en Actividades.');
    } else if (ok > 0) {
      avisar.error(`Se copió a ${ok} de ${nuevos.length} cursos`, 'Podés reintentar los que faltaron.');
    } else {
      avisar.error('No se pudo copiar la actividad', 'Revisá la conexión y probá de nuevo.');
    }
  };

  const fallidas = (resultados ?? []).filter(r => !r.id);
  const creadas = (resultados ?? []).filter(r => r.id);

  const pedirCierre = async () => {
    if (copiando) return;
    if (!resultados && elegidas.size > 0) {
      const ok = await confirmar({ titulo: '¿Cerrar sin copiar?', mensaje: 'Elegiste cursos pero todavía no copiaste la actividad.', accion: 'Cerrar', cancelar: 'Seguir' });
      if (!ok) return;
    }
    alCerrar();
  };

  return (
    <Dialogo abierto alCerrar={alCerrar} alPedirCierre={() => { void pedirCierre(); }} etiquetadoPor="ca-titulo" className="dialogo-em">
      <div className="em-modal ca-modal">
        <div className="em-modal-header">
          <h3 id="ca-titulo"><Copy size={18} aria-hidden="true" /> Copiar a otro curso</h3>
          <button className="btn btn-ghost" onClick={() => { void pedirCierre(); }} aria-label="Cerrar" disabled={copiando}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="em-modal-body">
          {resultados ? (
            <>
              {creadas.length > 0 && (
                <section>
                  <h4 className="ca-subtitulo"><Check size={15} aria-hidden="true" className="text-success" /> Copiada y publicada en</h4>
                  <ul className="ca-resultados">
                    {creadas.map(r => (
                      <li key={r.clave}>
                        <Link to={`/actividades/${r.id}`} onClick={alCerrar}>
                          {r.etiqueta} <ExternalLink size={13} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {fallidas.length > 0 && (
                <section>
                  <h4 className="ca-subtitulo"><AlertTriangle size={15} aria-hidden="true" className="text-danger" /> No se pudo copiar a</h4>
                  <ul className="ca-resultados ca-fallidas">
                    {fallidas.map(r => <li key={r.clave}>{r.etiqueta}</li>)}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <>
              <p className="ca-intro">
                Se crea una actividad nueva en cada curso que elijas, con el mismo título, consigna, preguntas
                y puntaje de <strong>“{activity.title}”</strong>. Sale publicada: los estudiantes de ese curso la ven al instante.
              </p>

              <fieldset className="ca-lista">
                <legend className="ca-subtitulo">¿A qué cursos?</legend>
                {opciones.map((o, i) => (
                  <div key={o.clave}>
                    {hayMisma && hayOtras && (i === 0 || opciones[i - 1].misma !== o.misma) && (
                      <p className="ca-grupo">{o.misma ? 'Misma materia' : 'Otras materias'}</p>
                    )}
                    <label className={`ca-opcion ${elegidas.has(o.clave) ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={elegidas.has(o.clave)}
                        onChange={() => alternar(o.clave)}
                        data-inicial={i === 0 ? '' : undefined}
                        disabled={copiando}
                      />
                      <span>{o.etiqueta}</span>
                    </label>
                  </div>
                ))}
              </fieldset>

              <div className="em-field">
                <label htmlFor="ca-fecha">Fecha de entrega (opcional)</label>
                <input
                  id="ca-fecha"
                  type="date"
                  min={hoyLocal()}
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  aria-describedby="ca-fecha-ayuda"
                  disabled={copiando}
                />
                <span id="ca-fecha-ayuda" className="ca-ayuda">
                  Si la dejás vacía, las copias quedan sin fecha de entrega.
                </span>
              </div>

              {copiando && <Cargando texto={`Copiando a ${elegidas.size} curso${elegidas.size !== 1 ? 's' : ''}…`} />}
            </>
          )}
        </div>

        <div className="em-modal-footer">
          {resultados ? (
            <>
              {fallidas.length > 0 && (
                <button className="btn btn-outline" onClick={() => copiar(fallidas.map(r => r.clave))} disabled={copiando}>
                  {copiando ? <><Loader2 size={15} className="girando" aria-hidden="true" /> Reintentando…</> : 'Reintentar los que faltaron'}
                </button>
              )}
              <Link to="/actividades" className="btn btn-secondary" onClick={alCerrar}>Ver mis actividades</Link>
              <button className="btn btn-primary" onClick={alCerrar} disabled={copiando}>Listo</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => { void pedirCierre(); }} disabled={copiando}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => copiar([...elegidas])} disabled={copiando || elegidas.size === 0}>
                {copiando
                  ? <><Loader2 size={15} className="girando" aria-hidden="true" /> Copiando…</>
                  : <><Copy size={15} aria-hidden="true" /> {elegidas.size > 1 ? `Copiar a ${elegidas.size} cursos` : 'Copiar'}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </Dialogo>
  );
}

interface BotonProps {
  activity: Activity;
  /** Solo el ícono (para las tarjetas de la lista). */
  compacto?: boolean;
  /** Después de crear copias (por ejemplo, para recargar la lista). */
  alCopiar?: () => void;
}

/** Botón "Copiar a otro curso" con su diálogo. Si no hay a dónde copiar, lo explica. */
export default function BotonCopiarActividad({ activity, compacto = false, alCopiar }: BotonProps) {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);

  const destinos = useMemo(
    () => (user?.subjects ?? []).filter(s => claveDe(s) !== claveDe(activity)),
    [user?.subjects, activity],
  );

  // Solo quien la creó la copia (RLS: se crea en sus propias materias)
  if (!user || activity.teacherId !== user.id) return null;

  const sinDestino = destinos.length === 0;
  const motivo = 'No tenés otro curso asignado: para copiarla necesitás tener otra materia o curso a tu cargo.';

  const tocar = () => {
    if (sinDestino) {
      avisar.info('No hay otro curso a donde copiarla', 'Tenés un solo curso asignado. Si das la materia en otro curso, pedile a dirección que te lo asigne.');
      return;
    }
    setAbierto(true);
  };

  return (
    <>
      <button
        type="button"
        className={compacto ? `btn-icon ${sinDestino ? 'ca-sin-destino' : ''}` : `btn btn-secondary btn-sm ${sinDestino ? 'ca-sin-destino' : ''}`}
        onClick={tocar}
        aria-disabled={sinDestino || undefined}
        aria-label={compacto ? 'Copiar a otro curso' : undefined}
        title={sinDestino ? motivo : 'Copiar esta actividad a otro de tus cursos'}
      >
        <Copy size={compacto ? 16 : 14} aria-hidden="true" />
        {!compacto && ' Copiar a otro curso'}
      </button>
      {abierto && <DialogoCopiar activity={activity} destinos={destinos} alCerrar={() => setAbierto(false)} alCopiar={alCopiar} />}
    </>
  );
}
