/**
 * Armar o editar una actividad, un trabajo práctico o una evaluación (063).
 *
 *  /actividades/nueva?tema=<id>&tipo=tp   · desde el tema de la planificación
 *  /actividades/:id/editar                · también después de publicada
 *
 * Partes de opción múltiple o de desarrollo, cada una con sus puntos (el
 * total es la suma), consigna, fecha de entrega y tema. Se guarda como
 * borrador (los estudiantes no la ven) o se publica. "Armar con IA" usa el
 * tema de la planificación (nunca datos de estudiantes).
 *
 * Con entregas, la base deja corregir textos, la correcta y los puntos (y
 * vuelve a corregir lo entregado), pero no agregar ni quitar partes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, Sparkles, Loader2, Lock, FileText, Scale } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PartesEditor from '../components/PartesEditor';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
import { useSinGuardar } from '../lib/sinGuardar';
import {
  createActivity, getActivityById, getSubmissionsByActivity, updateActivity,
} from '../services/activities.service';
import { getPlanningBySubjectAndCourse, getTema, esDelAnio } from '../services/planning.service';
import { getSubjects } from '../services/subjects.service';
import { armarActividad } from '../services/documents.service';
import {
  TIPOS_ACTIVIDAD, leerPuntos, puntoValido, puntosATexto, repartirPuntos, sumaDePuntos,
} from '../lib/actividades';
import type { Activity, ActivityQuestion, Subject, TipoActividad } from '../types';
import '../components/Modals.css';
import './Actividades.css';
import './EditarActividad.css';

interface TemaOpcion { id: string; titulo: string; unidad: string; objetivos: string[]; contenido?: string }

/** YYYY-MM-DD local de un timestamp */
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Lo que falta para poder guardar, en palabras del docente; '' si está todo. */
function problemaDe(titulo: string, partes: ActivityQuestion[], conPuntos: boolean, textoTotal: string, tipo: TipoActividad): string {
  if (!titulo.trim()) return 'Ponele un título.';
  for (const [i, q] of partes.entries()) {
    if (!q.prompt.trim()) return `A la parte ${i + 1} le falta el enunciado.`;
    if (q.type === 'multiple_choice') {
      const ops = q.options ?? [];
      if (ops.length < 2 || ops.some(o => !o.trim())) return `En la parte ${i + 1}, completá todas las opciones (al menos dos).`;
      if ((q.correct_index ?? -1) < 0 || (q.correct_index ?? 0) >= ops.length) return `En la parte ${i + 1}, marcá la opción correcta.`;
    }
    if (conPuntos && (typeof q.points !== 'number' || !puntoValido(q.points))) {
      return `Los puntos de la parte ${i + 1} van de 0 a 100, enteros o con medio punto.`;
    }
  }
  if (conPuntos) {
    if (partes.length === 0) return 'Para poner puntos por parte, agregá al menos una parte.';
    const suma = sumaDePuntos(partes);
    if (!Number.isInteger(suma)) return `Los puntos suman ${puntosATexto(suma)}: tienen que sumar un número entero.`;
    if (suma < 1) return 'Los puntos tienen que sumar al menos 1.';
  } else if (textoTotal.trim()) {
    const t = leerPuntos(textoTotal);
    if (t === null || Number.isNaN(t) || !Number.isInteger(t) || t < 1 || t > 100) return 'El puntaje total va de 1 a 100.';
  } else if (tipo !== 'actividad') {
    // Sin puntaje no hay nota que pasar a la libreta
    return `${tipo === 'tp' ? 'Un trabajo práctico' : 'Una evaluación'} lleva puntaje: poné el total o puntos por parte.`;
  }
  return '';
}

export default function EditarActividad() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const asignaciones = useMemo(() => user?.subjects ?? [], [user]);
  const anio = new Date().getFullYear();

  const [cargando, setCargando] = useState(true);
  const [noEsta, setNoEsta] = useState(false);
  const [original, setOriginal] = useState<Activity | null>(null);
  const [entregas, setEntregas] = useState(0);
  const [materias, setMaterias] = useState<Record<string, Subject>>({});

  const [asig, setAsig] = useState<{ subjectId: string; courseId: string } | null>(null);
  const [temas, setTemas] = useState<TemaOpcion[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [tipo, setTipo] = useState<TipoActividad>('tp');
  const [titulo, setTitulo] = useState('');
  const [consigna, setConsigna] = useState('');
  const [partes, setPartes] = useState<ActivityQuestion[]>([]);
  const [conPuntos, setConPuntos] = useState(true);
  const [textosPuntos, setTextosPuntos] = useState<Record<string, string>>({});
  const [textoTotal, setTextoTotal] = useState('10');
  const [vence, setVence] = useState('');
  const [pedido, setPedido] = useState('');
  const [armando, setArmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [sucio, setSucio] = useState(false);
  useSinGuardar('editar-actividad', sucio);
  const armarRef = useRef<AbortController | null>(null);

  const bloqueado = entregas > 0;
  const asignacion = asig ? asignaciones.find(a => a.subjectId === asig.subjectId && a.courseId === asig.courseId) : undefined;
  const materiaNombre = asig ? materias[asig.subjectId]?.name ?? 'Materia' : '';
  const cursoNombre = asignacion?.courseName ?? '';
  const temaElegido = temas.find(t => t.id === classId);
  const volverA = classId ? `/tema/${classId}` : original ? `/actividades/${original.id}` : '/actividades';

  // ── Carga ──
  useEffect(() => {
    if (!user) return;
    getSubjects(user.schoolId)
      .then(l => setMaterias(Object.fromEntries(l.map(s => [s.id, s]))))
      .catch(console.error);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let vigente = true;
    (async () => {
      setCargando(true);
      try {
        if (id) {
          const [act, subs] = await Promise.all([getActivityById(id), getSubmissionsByActivity(id).catch(() => [])]);
          if (!vigente) return;
          if (!act || act.teacherId !== user.id) { setNoEsta(true); return; }
          setOriginal(act);
          setEntregas(subs.length);
          setAsig({ subjectId: act.subjectId, courseId: act.courseId });
          setClassId(act.classId ?? '');
          setTipo(act.tipo);
          setTitulo(act.title);
          setConsigna(act.contentMd);
          setPartes(act.questions);
          const porParte = act.questions.some(q => typeof q.points === 'number');
          setConPuntos(porParte);
          setTextoTotal(!porParte && act.points != null ? String(act.points) : '');
          setVence(act.dueDate ? diaLocal(act.dueDate) : '');
          return;
        }
        const t = searchParams.get('tipo');
        if (t === 'actividad' || t === 'tp' || t === 'evaluacion') setTipo(t);
        const temaId = searchParams.get('tema');
        if (temaId) {
          const r = await getTema(temaId).catch(() => null);
          if (!vigente) return;
          if (r && r.unidad.teacherId === user.id) {
            setAsig({ subjectId: r.unidad.subjectId, courseId: r.unidad.courseId });
            setClassId(r.tema.id);
            return;
          }
        }
        const m = searchParams.get('materia');
        const c = searchParams.get('curso');
        const a = asignaciones.find(x => x.subjectId === m && x.courseId === c) ?? asignaciones[0];
        if (a) setAsig({ subjectId: a.subjectId, courseId: a.courseId });
      } catch (err) {
        console.error(err);
        if (vigente) setNoEsta(true);
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
    // Solo al entrar: los parámetros de la URL son el punto de partida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // Los temas de esa materia y curso, de este año
  useEffect(() => {
    if (!user || !asig) return;
    let vigente = true;
    getPlanningBySubjectAndCourse(asig.subjectId, asig.courseId, user.id)
      .then(unidades => {
        if (!vigente) return;
        setTemas(unidades.filter(u => esDelAnio(u, anio)).flatMap(u => u.classes.map(c => ({
          id: c.id, titulo: c.title, unidad: u.title, objetivos: c.objectives ?? [], contenido: c.content,
        }))));
      })
      .catch(err => { console.error(err); if (vigente) setTemas([]); });
    return () => { vigente = false; };
  }, [user, asig, anio]);

  useEffect(() => () => armarRef.current?.abort(), []);

  const tocar = () => setSucio(true);

  // ── Armar con IA ──
  const armarConIA = async () => {
    if (armando || bloqueado) return;
    const tema = temaElegido?.titulo || titulo.trim();
    if (!tema) {
      setError('Elegí el tema o escribí el título, para que la IA sepa de qué armarla.');
      return;
    }
    if ((partes.length > 0 || consigna.trim()) && !(await confirmar({
      titulo: '¿Reemplazar lo que armaste?',
      mensaje: 'La IA arma la consigna y las partes de nuevo, en lugar de las que hay. Usa 1 uso de IA.',
      accion: 'Reemplazar',
    }))) return;
    const controller = new AbortController();
    armarRef.current = controller;
    setArmando(true);
    setError('');
    try {
      const r = await armarActividad({
        tipo,
        tema,
        unidad: temaElegido?.unidad,
        objetivos: temaElegido?.objetivos,
        contenido: temaElegido?.contenido,
        pedido,
        materia: materiaNombre,
        curso: cursoNombre,
      });
      if (armarRef.current !== controller) return;
      if (r.partes.length === 0) {
        setError('La IA no devolvió partes. Probá de nuevo o pedile algo más concreto.');
        return;
      }
      if (!titulo.trim()) setTitulo(r.titulo);
      setConsigna(r.consigna);
      const conTodos = r.partes.every(q => typeof q.points === 'number' && puntoValido(q.points));
      const suma = sumaDePuntos(r.partes);
      setPartes(conTodos && Number.isInteger(suma) && suma >= 1 ? r.partes : repartirPuntos(r.partes, 10));
      setConPuntos(true);
      setTextosPuntos({});
      setSucio(true);
      avisar.exito('Listo: revisala antes de guardar', 'Corregí lo que haga falta. La IA puede equivocarse, sobre todo en la opción correcta.');
    } catch (err) {
      if (armarRef.current !== controller) return;
      setError(err instanceof Error ? err.message : 'No se pudo armar con la IA. Probá de nuevo.');
    } finally {
      if (armarRef.current === controller) {
        armarRef.current = null;
        setArmando(false);
      }
    }
  };

  // ── Guardar ──
  const guardar = async (accion: 'borrador' | 'publicar' | 'cambios') => {
    if (!user || !asig || guardando) return;
    const problema = problemaDe(titulo, partes, conPuntos, textoTotal, tipo);
    if (problema) { setError(problema); return; }
    const preguntas: ActivityQuestion[] = partes.map(q => {
      const base: ActivityQuestion = {
        id: q.id, type: q.type, prompt: q.prompt.trim(),
        options: q.type === 'multiple_choice' ? (q.options ?? []).map(o => o.trim()) : [],
        correct_index: q.type === 'multiple_choice' ? q.correct_index ?? 0 : 0,
      };
      return conPuntos ? { ...base, points: q.points as number } : base;
    });
    const total = conPuntos ? sumaDePuntos(preguntas) : (leerPuntos(textoTotal) ?? null);
    const dueDate = vence ? new Date(`${vence}T23:59:00`).toISOString() : null;
    setGuardando(true);
    setError('');
    try {
      if (!original) {
        const act = await createActivity({
          title: titulo.trim(),
          contentMd: consigna,
          questions: preguntas,
          subjectId: asig.subjectId,
          courseId: asig.courseId,
          teacherId: user.id,
          schoolId: user.schoolId,
          classId: classId || null,
          sourceTool: null,
          dueDate,
          points: total,
          tipo,
          estado: accion === 'publicar' ? 'published' : 'draft',
        });
        setSucio(false);
        if (accion === 'publicar') {
          avisar.exito(`${TIPOS_ACTIVIDAD[tipo].label} publicada`, `Ya la ven en ${cursoNombre}, también sin señal una vez que la abren.`);
          navigate(`/actividades/${act.id}`, { replace: true });
        } else {
          avisar.exito('Guardada como borrador', 'Los estudiantes no la ven hasta que la publiques.');
          navigate(`/actividades/${act.id}/editar`, { replace: true });
        }
        return;
      }
      await updateActivity(original.id, {
        title: titulo.trim(),
        contentMd: consigna,
        questions: preguntas,
        points: total,
        dueDate,
        tipo,
        classId: classId || null,
        ...(accion === 'publicar' ? { status: 'published' as const } : {}),
      });
      setSucio(false);
      if (accion === 'publicar') {
        avisar.exito(`${TIPOS_ACTIVIDAD[tipo].label} publicada`, `Ya la ven en ${cursoNombre}.`);
        navigate(`/actividades/${original.id}`, { replace: true });
      } else {
        avisar.exito(original.status === 'draft' ? 'Borrador guardado' : 'Cambios guardados',
          bloqueado ? 'Lo que se corrige solo (opción múltiple) ya se volvió a corregir. Las notas que pusiste vos no cambian: si cambiaste la correcta o los puntos, revisalas.' : undefined);
        const fresca = await getActivityById(original.id);
        if (fresca) setOriginal(fresca);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      setError(msg && !/fetch|network/i.test(msg) ? msg : 'No se pudo guardar. Revisá la señal y probá de nuevo; lo que armaste sigue acá.');
    } finally {
      setGuardando(false);
    }
  };

  // Con entregas no se pueden cambiar las partes: una copia en borrador, en
  // el mismo curso y tema, con lo que está en pantalla
  const duplicar = async () => {
    if (!user || !asig || !original || guardando) return;
    setGuardando(true);
    setError('');
    try {
      const copia = await createActivity({
        title: `${titulo.trim() || original.title} (copia)`.slice(0, 120),
        contentMd: consigna,
        questions: partes,
        subjectId: asig.subjectId,
        courseId: asig.courseId,
        teacherId: user.id,
        schoolId: user.schoolId,
        classId: classId || null,
        sourceTool: original.sourceTool ?? null,
        dueDate: vence ? new Date(`${vence}T23:59:00`).toISOString() : null,
        points: conPuntos ? sumaDePuntos(partes) : (leerPuntos(textoTotal) ?? null),
        tipo,
        estado: 'draft',
      });
      setSucio(false);
      avisar.exito('Copia en borrador', 'Cambiale lo que quieras y publicala. La original sigue como estaba.');
      navigate(`/actividades/${copia.id}/editar`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : 'No se pudo duplicar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  if (!user) return null;
  if (cargando) return <div className="ea-contenedor"><Esqueleto tipo="tarjetas" cantidad={2} etiqueta="Cargando…" /></div>;
  if (noEsta) return (
    <div className="ea-contenedor">
      <EstadoVacio icono={FileText} titulo="No encontramos esta actividad"
        texto="Puede que la hayan borrado o que sea de otro docente."
        accion={{ etiqueta: 'Ver mis actividades', a: '/actividades', icono: ArrowLeft }} />
    </div>
  );
  if (!asig) return (
    <div className="ea-contenedor">
      <EstadoVacio icono={FileText} titulo="Todavía no tenés cursos asignados"
        texto="Cuando dirección te asigne una materia y un curso, desde acá armás sus trabajos prácticos y evaluaciones."
        accion={{ etiqueta: 'Volver', a: '/actividades', icono: ArrowLeft }} />
    </div>
  );

  const borrador = !original || original.status === 'draft';
  const suma = sumaDePuntos(partes);

  return (
    <div className="ea-contenedor animate-in">
      <Link to={volverA} className="acts-back"><ArrowLeft size={15} /> {classId ? 'El tema' : original ? 'La actividad' : 'Actividades'}</Link>

      <div className="card ea-card">
        <div className="ea-encabezado">
          <h2>{original ? (borrador ? 'Borrador' : 'Editar') : 'Armar'}: {TIPOS_ACTIVIDAD[tipo].label.toLowerCase()}</h2>
          <span className="ea-para">{materiaNombre} · {cursoNombre}</span>
          {original && !borrador && <span className="badge badge-success">Publicada</span>}
          {borrador && <span className="badge badge-neutral">Los estudiantes todavía no la ven</span>}
        </div>

        {bloqueado && (
          <p className="ea-aviso" role="status">
            <Lock size={14} aria-hidden="true" />
            <span>
              Ya hay {entregas === 1 ? 'una entrega' : `${entregas} entregas`} (en la app o anotadas por vos): podés corregir los textos, la opción correcta y los puntos,
              pero no agregar, quitar ni reordenar partes u opciones. Lo de opción múltiple se vuelve a corregir solo; las notas que pusiste vos, no.
              {' '}Para cambiar las partes,{' '}
              <button type="button" className="ea-link" onClick={duplicar} disabled={guardando}>duplicala como borrador</button>.
            </span>
          </p>
        )}

        {!original && asignaciones.length > 1 && !searchParams.get('tema') && (
          <div className="em-field">
            <label htmlFor="ea-para">Para</label>
            <select id="ea-para" className="form-select"
              value={`${asig.subjectId}|${asig.courseId}`}
              onChange={e => {
                const [s, c] = e.target.value.split('|');
                setAsig({ subjectId: s, courseId: c });
                setClassId('');
                tocar();
              }}>
              {asignaciones.map(a => (
                <option key={`${a.subjectId}|${a.courseId}`} value={`${a.subjectId}|${a.courseId}`}>
                  {materias[a.subjectId]?.name ?? 'Materia'} · {a.courseName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="em-row">
          <div className="em-field">
            <label htmlFor="ea-tema">Tema de la planificación</label>
            <select id="ea-tema" className="form-select" value={classId}
              onChange={e => { setClassId(e.target.value); tocar(); }}>
              <option value="">Sin tema</option>
              {temas.map(t => <option key={t.id} value={t.id}>{t.unidad} · {t.titulo}</option>)}
            </select>
          </div>
          <div className="em-field">
            <span className="ea-etiqueta" id="ea-tipo-l">Qué es</span>
            <div className="ea-tipos" role="group" aria-labelledby="ea-tipo-l">
              {(Object.keys(TIPOS_ACTIVIDAD) as TipoActividad[]).map(t => (
                <button key={t} type="button" aria-pressed={tipo === t}
                  className={tipo === t ? 'activo' : ''} onClick={() => { setTipo(t); tocar(); }}>
                  <span aria-hidden="true">{TIPOS_ACTIVIDAD[t].emoji}</span> {TIPOS_ACTIVIDAD[t].corto}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!bloqueado && (
          <div className="ea-ia">
            <div className="em-field">
              <label htmlFor="ea-pedido">Armar con IA {temaElegido ? <>desde «{temaElegido.titulo}»</> : '(elegí un tema o escribí el título)'}</label>
              <input id="ea-pedido" type="text" maxLength={300} value={pedido}
                placeholder="Opcional: «4 partes, una con un caso de la vida diaria»"
                onChange={e => setPedido(e.target.value)} />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={armarConIA} disabled={armando}>
              {armando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {armando ? 'Armando…' : 'Armar con IA'}
            </button>
          </div>
        )}

        <div className="em-field">
          <label htmlFor="ea-titulo">Título</label>
          <input id="ea-titulo" type="text" maxLength={120} value={titulo}
            placeholder="Ej: Fracciones equivalentes"
            onChange={e => { setTitulo(e.target.value); tocar(); }} />
        </div>

        <div className="em-field">
          <label htmlFor="ea-consigna">Consigna para los estudiantes</label>
          <textarea id="ea-consigna" rows={5} value={consigna}
            placeholder="Qué van a hacer, qué material usar y cómo se califica"
            onChange={e => { setConsigna(e.target.value); tocar(); }} />
          <p className="em-hint">Se lee en el celular y sin señal: que se entienda sin que la expliques.</p>
        </div>

        <div className="ea-partes-cabecera">
          <h3>Partes</h3>
          <label className="ea-con-puntos">
            <input type="checkbox" checked={conPuntos}
              onChange={e => {
                const si = e.target.checked;
                setConPuntos(si);
                if (si && partes.length && !partes.some(q => typeof q.points === 'number')) setPartes(repartirPuntos(partes, 10));
                // Sin puntos por parte, el total arranca en lo que sumaban (si no, la actividad saldría de la libreta)
                if (!si) setTextoTotal(Number.isInteger(suma) && suma >= 1 && suma <= 100 ? String(suma) : '10');
                setTextosPuntos({});
                tocar();
              }} />
            <Scale size={14} aria-hidden="true" /> Puntos por parte
          </label>
          {conPuntos && partes.length > 0 && (
            <>
              <span className={`ea-total ${Number.isInteger(suma) ? '' : 'mal'}`}>Total: <strong>{puntosATexto(suma)}</strong> puntos</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPartes(repartirPuntos(partes, 10)); setTextosPuntos({}); tocar(); }}>
                Repartir 10
              </button>
            </>
          )}
        </div>

        <PartesEditor
          partes={partes}
          alCambiar={p => { setPartes(p); tocar(); }}
          conPuntos={conPuntos}
          bloqueado={bloqueado}
          textosPuntos={textosPuntos}
          alCambiarTextoPuntos={(qid, t) => setTextosPuntos(prev => ({ ...prev, [qid]: t }))}
        />

        <div className="em-row">
          {!conPuntos && (
            <div className="em-field">
              <label htmlFor="ea-total">Puntaje total (opcional)</label>
              <input id="ea-total" type="text" inputMode="numeric" maxLength={3} value={textoTotal}
                onChange={e => { setTextoTotal(e.target.value); tocar(); }} />
            </div>
          )}
          <div className="em-field">
            <label htmlFor="ea-vence">Fecha de entrega (opcional)</label>
            <input id="ea-vence" type="date" value={vence} onChange={e => { setVence(e.target.value); tocar(); }} />
          </div>
        </div>

        {error && <p className="em-error" role="alert">{error}</p>}

        <div className="ea-pie">
          {borrador ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => guardar('borrador')} disabled={guardando}>
                <Save size={14} /> {guardando ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar('publicar')} disabled={guardando}>
                <Send size={14} /> Publicar a {cursoNombre}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar('cambios')} disabled={guardando}>
              <Save size={14} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
