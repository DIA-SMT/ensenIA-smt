/**
 * Preparar la clase: un tema de la planificación con todo lo suyo (063).
 *
 *  · Para dar la clase: el apunte, la presentación y los archivos del tema.
 *    Se arma con la IA o se suma algo que ya está en la biblioteca.
 *  · Para los chicos: las actividades, los TP y las evaluaciones del tema,
 *    con sus borradores. Se hacen en el celular y sin señal, o en papel (se
 *    anota en la actividad).
 *  · Para la clase en vivo: las preguntas que se lanzan con un toque (068).
 *
 * Se llega desde Planificación y desde Hoy.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { lecturasActuales, suscribirLecturas } from '../lib/lecturasEnCurso';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Circle, ClipboardList, Eye, FileText,
  FlaskConical, Layers, Plus, Presentation, Radio, ScanLine, Sparkles, Unlink, Upload,
} from 'lucide-react';
import PreguntasEnVivoEditor from '../components/PreguntasEnVivoEditor';
import { useAuth } from '../contexts/AuthContext';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
import MaterialViewer from '../components/MaterialViewer';
import { getTema, updateClass } from '../services/planning.service';
import { getActivitiesByClass } from '../services/activities.service';
import { asignarTema, getMaterialsByClass, getMaterialsByTeacher } from '../services/library.service';
import { getSignedUrl } from '../services/documents.service';
import { getSubjects } from '../services/subjects.service';
import { fechaCorta } from '../services/planificacion.service';
import { TIPOS_ACTIVIDAD } from '../lib/actividades';
import type { Activity, LibraryMaterial, PlanningClass, PlanningUnit, TipoActividad } from '../types';
import './Actividades.css';
import './TemaPreparar.css';

/** Qué es un material, en una palabra para el docente */
function claseDeMaterial(m: LibraryMaterial): string {
  if (m.tags.includes('módulo')) return 'Apunte de la clase';
  if (m.slides) return 'Presentación';
  if (m.visual) return 'Diagrama o juego';
  if (m.videoUrl) return 'Video';
  return { pdf: 'PDF', doc: 'Documento', pptx: 'PowerPoint', image: 'Imagen', link: 'Enlace', video: 'Video' }[m.fileType] ?? 'Archivo';
}

/** El día en Argentina de un timestamp (la entrega vence a las 23:59 de ese día) */
const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

const ESTADO: Record<Activity['status'], { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'badge-neutral' },
  published: { label: 'Publicada', cls: 'badge-success' },
  closed: { label: 'Cerrada', cls: 'badge-neutral' },
};

export default function TemaPreparar() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [tema, setTema] = useState<PlanningClass | null>(null);
  // Lecturas de texto en curso (lib/lecturasEnCurso): el escaneo que se acaba de subir
  const lecturas = useSyncExternalStore(suscribirLecturas, lecturasActuales);
  const [unidad, setUnidad] = useState<PlanningUnit | null>(null);
  const [materiales, setMateriales] = useState<LibraryMaterial[]>([]);
  const [actividades, setActividades] = useState<Activity[]>([]);
  const [materiaNombre, setMateriaNombre] = useState('');
  const [verContenido, setVerContenido] = useState(false);
  const [viendo, setViendo] = useState<LibraryMaterial | null>(null);
  // Sumar algo que ya está en la biblioteca
  const [sumando, setSumando] = useState(false);
  const [biblioteca, setBiblioteca] = useState<LibraryMaterial[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id || !user) return;
    setCargando(true);
    try {
      const r = await getTema(id);
      if (!r || r.unidad.teacherId !== user.id) { setTema(null); return; }
      setTema(r.tema);
      setUnidad(r.unidad);
      const [mats, acts, materias] = await Promise.all([
        getMaterialsByClass(id).catch(() => [] as LibraryMaterial[]),
        getActivitiesByClass(id).catch(() => [] as Activity[]),
        getSubjects(user.schoolId).catch(() => []),
      ]);
      setMateriales(mats.filter(m => m.teacherId === user.id));
      setActividades(acts);
      setMateriaNombre(materias.find(s => s.id === r.unidad.subjectId)?.name ?? '');
    } catch (err) {
      console.error(err);
      setTema(null);
    } finally {
      setCargando(false);
    }
  }, [id, user]);

  useEffect(() => { void cargar(); }, [cargar]);

  const curso = useMemo(
    () => (unidad ? user?.subjects?.find(a => a.subjectId === unidad.subjectId && a.courseId === unidad.courseId)?.courseName ?? '' : ''),
    [unidad, user],
  );

  // Lo de la biblioteca que se puede sumar: de la materia, de este curso o
  // de "todos mis cursos", y que no esté ya en otro tema
  const sumables = useMemo(() => (biblioteca ?? []).filter(m =>
    unidad && m.subjectId === unidad.subjectId
    && (!m.courseId || m.courseId === unidad.courseId)
    && !m.classId), [biblioteca, unidad]);

  if (!user) return null;
  if (cargando) return <div className="tp-contenedor"><Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Cargando el tema…" /></div>;
  if (!tema || !unidad) return (
    <div className="tp-contenedor">
      <EstadoVacio icono={BookOpen} titulo="No encontramos este tema"
        texto="Puede que lo hayan borrado de la planificación."
        accion={{ etiqueta: 'Ir a la planificación', a: '/planificacion', icono: ArrowLeft }} />
    </div>
  );

  const alternarDada = async () => {
    const nuevo = !tema.isComplete;
    setTema({ ...tema, isComplete: nuevo });
    try {
      await updateClass(tema.id, { isComplete: nuevo });
    } catch (err) {
      console.error(err);
      setTema({ ...tema, isComplete: !nuevo });
      avisar.error('No se pudo guardar', 'Probá de nuevo.');
    }
  };

  const abrirSumar = async () => {
    setSumando(true);
    if (biblioteca === null) {
      try { setBiblioteca(await getMaterialsByTeacher(user.id)); } catch (err) { console.error(err); setBiblioteca([]); }
    }
  };

  const sumar = async (m: LibraryMaterial) => {
    if (trabajando) return;
    setTrabajando(true);
    try {
      await asignarTema(m.id, tema.id);
      setMateriales(prev => [...prev, { ...m, classId: tema.id }]);
      setBiblioteca(prev => prev?.map(x => (x.id === m.id ? { ...x, classId: tema.id } : x)) ?? null);
      avisar.exito('Sumado al tema', m.title);
    } catch (err) {
      avisar.error('No se pudo sumar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  };

  const sacar = async (m: LibraryMaterial) => {
    if (trabajando) return;
    const ok = await confirmar({
      titulo: `¿Sacar «${m.title}» de este tema?`,
      mensaje: 'Sigue en tu biblioteca; solo deja de estar en este tema.',
      accion: 'Sacar del tema',
    });
    if (!ok) return;
    setTrabajando(true);
    try {
      await asignarTema(m.id, null);
      setMateriales(prev => prev.filter(x => x.id !== m.id));
      setBiblioteca(prev => prev?.map(x => (x.id === m.id ? { ...x, classId: null } : x)) ?? null);
    } catch (err) {
      avisar.error('No se pudo sacar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  };

  const descargar = async (m: LibraryMaterial) => {
    if (!m.storagePath) return;
    try {
      const a = document.createElement('a');
      a.href = await getSignedUrl(m.storagePath, m.fileName || m.title);
      a.click();
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo descargar el archivo.', 'Probá de nuevo en un rato.');
    }
  };

  const nueva = (tipo: TipoActividad) => `/actividades/nueva?tema=${tema.id}&tipo=${tipo}`;
  // Subir o escanear derecho a este tema; al terminar vuelve acá
  const subirAlTema = (como: 'archivo' | 'escanear') =>
    `/biblioteca?subir=${como}&tema=${tema.id}&volver=${encodeURIComponent(`/tema/${tema.id}`)}`;
  const delPlan = `/planificacion?materia=${unidad.subjectId}&curso=${unidad.courseId}&clase=${tema.id}`;

  return (
    <div className="tp-contenedor animate-in">
      <Link to={delPlan} className="acts-back"><ArrowLeft size={15} /> Planificación</Link>

      {/* ── El tema ── */}
      <section className="card tp-tema" aria-labelledby="tp-titulo">
        <p className="tp-unidad">{materiaNombre}{curso ? ` · ${curso}` : ''} · {unidad.title}</p>
        <h2 id="tp-titulo">{tema.title}</h2>
        <div className="tp-meta">
          {tema.fecha && (
            <span><CalendarDays size={14} aria-hidden="true" /> {fechaCorta(tema.fecha)}</span>
          )}
          <button type="button" className={`tp-dada ${tema.isComplete ? 'si' : ''}`} onClick={alternarDada} aria-pressed={tema.isComplete}>
            {tema.isComplete ? <CheckCircle2 size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
            {tema.isComplete ? 'Dada' : 'Marcar como dada'}
          </button>
        </div>
        {(tema.objectives ?? []).length > 0 && (
          <ul className="tp-objetivos">
            {(tema.objectives ?? []).map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        )}
        {tema.content && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerContenido(v => !v)} aria-expanded={verContenido}>
              {verContenido ? 'Ocultar el contenido' : 'Ver el contenido del tema'}
            </button>
            {verContenido && <p className="tp-contenido">{tema.content}</p>}
          </>
        )}
      </section>

      {/* ── Para dar la clase ── */}
      <section className="card tp-seccion" aria-labelledby="tp-clase">
        <div className="tp-seccion-cabecera">
          <h3 id="tp-clase"><Presentation size={17} aria-hidden="true" /> Para dar la clase</h3>
        </div>
        {materiales.length === 0 ? (
          <p className="tp-vacio">Todavía no hay material en este tema.</p>
        ) : (
          <ul className="tp-lista">
            {materiales.map(m => (
              <li key={m.id} className="tp-item">
                <span className="tp-item-texto">
                  <span className="tp-item-titulo">{m.title}</span>
                  <small>{claseDeMaterial(m)}{m.isSharedWithStudents ? ' · lo ven los estudiantes' : ''}</small>
                  {/* Recién subido: la IA todavía lo está leyendo (sigue aunque se cambie de pantalla) */}
                  {lecturas.has(m.id) && <small className="tp-leyendo" role="status">{lecturas.get(m.id)}</small>}
                </span>
                <button type="button" className="btn-icon" onClick={() => setViendo(m)} aria-label={`Ver ${m.title}`} title="Ver"><Eye size={16} /></button>
                <button type="button" className="btn-icon" onClick={() => sacar(m)} aria-label={`Sacar ${m.title} del tema`} title="Sacar del tema" disabled={trabajando}><Unlink size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        {/* Lo que el docente ya tiene: se sube o se escanea derecho a este tema */}
        <div className="tp-acciones">
          <Link to={subirAlTema('archivo')} className="btn btn-primary btn-sm"><Upload size={14} /> Subir un archivo</Link>
          <Link to={subirAlTema('escanear')} className="btn btn-outline btn-sm"><ScanLine size={14} /> Escanear hojas</Link>
        </div>
        <div className="tp-acciones">
          <Link to={`/modulo?tema=${tema.id}`} className="btn btn-outline btn-sm"><Layers size={14} /> Armar la clase completa</Link>
          <Link to={`/ia-lab?clase=${tema.id}&herramienta=pres`} className="btn btn-outline btn-sm"><Presentation size={14} /> Presentación con IA</Link>
          <button type="button" className="btn btn-outline btn-sm" onClick={abrirSumar}><Plus size={14} /> Sumar de la biblioteca</button>
        </div>
        {sumando && (
          <div className="tp-sumar">
            {biblioteca === null ? <p className="tp-vacio">Buscando en tu biblioteca…</p>
              : sumables.length === 0 ? <p className="tp-vacio">No hay materiales de {materiaNombre || 'esta materia'} sin tema. Lo que subas a la biblioteca aparece acá.</p>
                : (
                  <ul className="tp-lista">
                    {sumables.map(m => (
                      <li key={m.id} className="tp-item">
                        <span className="tp-item-texto">
                          <span className="tp-item-titulo">{m.title}</span>
                          <small>{claseDeMaterial(m)}</small>
                        </span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => sumar(m)} disabled={trabajando}>Sumar</button>
                      </li>
                    ))}
                  </ul>
                )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSumando(false)}>Listo</button>
          </div>
        )}
      </section>

      {/* ── Para los chicos ── */}
      <section className="card tp-seccion" aria-labelledby="tp-chicos">
        <div className="tp-seccion-cabecera">
          <h3 id="tp-chicos"><ClipboardList size={17} aria-hidden="true" /> Para los chicos</h3>
          <p className="tp-ayuda">Lo hacen en el celular (una vez que la abrieron, sigue andando sin señal). Si alguno lo hace en papel, lo anotás en la actividad.</p>
        </div>
        {actividades.length === 0 ? (
          <p className="tp-vacio">Todavía no hay actividades, trabajos prácticos ni evaluaciones de este tema.</p>
        ) : (
          <ul className="tp-lista">
            {actividades.map(a => (
              <li key={a.id} className="tp-item">
                <span className="tp-emoji" aria-hidden="true">{TIPOS_ACTIVIDAD[a.tipo].emoji}</span>
                <span className="tp-item-texto">
                  <Link to={a.status === 'draft' ? `/actividades/${a.id}/editar` : `/actividades/${a.id}`} className="tp-item-titulo">{a.title}</Link>
                  <small>
                    {TIPOS_ACTIVIDAD[a.tipo].label}
                    {a.points != null ? ` · ${a.points} puntos` : ''}
                    {a.dueDate ? ` · entrega ${fechaCorta(diaDe(a.dueDate))}` : ''}
                  </small>
                </span>
                <span className={`badge ${ESTADO[a.status].cls}`}>{ESTADO[a.status].label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="tp-acciones">
          <Link to={nueva('tp')} className="btn btn-primary btn-sm"><FileText size={14} /> Trabajo práctico</Link>
          <Link to={nueva('evaluacion')} className="btn btn-outline btn-sm"><ClipboardList size={14} /> Evaluación</Link>
          <Link to={nueva('actividad')} className="btn btn-outline btn-sm"><Sparkles size={14} /> Actividad corta</Link>
        </div>
      </section>

      {/* ── Para la clase en vivo ── */}
      <section className="card tp-seccion" aria-labelledby="tp-vivo">
        <div className="tp-seccion-cabecera">
          <h3 id="tp-vivo"><Radio size={17} aria-hidden="true" /> Para la clase en vivo</h3>
          <p className="tp-ayuda">Preguntas para lanzar durante la clase: los chicos contestan desde el celular y ves las respuestas al instante.</p>
        </div>
        <PreguntasEnVivoEditor classId={tema.id} actividades={actividades} />
      </section>

      <Link to={`/ia-lab?clase=${tema.id}`} className="tp-ia">
        <FlaskConical size={16} aria-hidden="true" /> ¿Otra cosa? Preguntale a la IA sobre este tema
      </Link>

      {viendo && (
        <MaterialViewer material={viendo} onClose={() => setViendo(null)}
          onDescargar={viendo.storagePath ? () => descargar(viendo) : undefined} verNotas />
      )}
    </div>
  );
}
