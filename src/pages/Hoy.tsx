/**
 * SMT EstudIA — Hoy (pantalla principal del docente)
 *
 * El docente no piensa en herramientas, piensa en sus clases. Acá ve
 * las de hoy en orden y, en cada una, lo único que necesita decidir:
 * prepararla, darla, pasar lista o ver cómo les fue. Todo lo demás
 * queda abajo, como contexto.
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Sparkles, Radio, CheckSquare, BarChart3, Clock, Sun, AlertTriangle,
    Users, ClipboardCheck, ChevronRight, HelpCircle, Check, Upload, Rocket, Boxes,
    History, ClipboardList, CalendarDays, CalendarRange, FolderOpen, CheckCircle2, Target, WifiOff, Megaphone,
} from 'lucide-react';
import EstadoVacio from '../components/ui/EstadoVacio';
import PrepararAula from '../components/PrepararAula';
import InstalarApp from '../components/InstalarApp';
import { Esqueleto } from '../components/ui/Esqueleto';
import { useAuth } from '../contexts/AuthContext';
import EmojiMateria from '../components/ui/EmojiMateria';
import { getScheduleByTeacher } from '../services/schedule.service';
import { horaATexto } from '../lib/horas';
import { useResumenRepaso } from '../services/comprension.service';
import { getTeacherStats, getTeacherTimeline, type TimelineItem, type TimelineKind } from '../services/stats.service';
import { getAlertsByTeacher } from '../services/alerts.service';
import { getRecentAttendance, todayISO } from '../services/attendance.service';
import { getMyLiveSession, getMyPastSessions, type LiveSession } from '../services/live.service';
import BotonMigue from '../components/BotonMigue';
import { getActivitiesByTeacher } from '../services/activities.service';
import { getMaterialsByTeacher } from '../services/library.service';
import { pendientesDe } from '../services/offline-queue.service';
import { consultasSinResponder } from '../services/seguimiento.service';
import { getCommunicationsBySchool, sinLeer } from '../services/communications.service';
import { getTemasConFecha } from '../services/planning.service';
import { hoyISO, getDiasSinClase, type DiaSinClase } from '../services/planificacion.service';
import type { ScheduleBlock, Alert as AlertType, TeacherStats, Communication, PlanningUnit, PlanningClass } from '../types';
import './Hoy.css';

const TIMELINE_META: Record<TimelineKind, { icon: typeof Boxes; label: string }> = {
    modulo: { icon: Boxes, label: 'Armaste una clase completa' },
    material: { icon: Upload, label: 'Subiste material' },
    actividad: { icon: ClipboardList, label: 'Publicaste una actividad' },
    vivo: { icon: Radio, label: 'Diste una clase en vivo' },
    asistencia: { icon: CheckSquare, label: 'Pasaste lista' },
    correccion: { icon: ClipboardCheck, label: 'Corregiste una entrega' },
};

function timeAgo(iso: string): string {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return mins <= 1 ? 'Recién' : `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Ayer';
    if (days < 30) return `Hace ${days} días`;
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

/** Lo mismo varias veces seguidas (tres clases en vivo de Lengua) va en un solo renglón */
interface GrupoRastro { item: TimelineItem; veces: number }
function agruparRastro(items: TimelineItem[]): GrupoRastro[] {
    const grupos: GrupoRastro[] = [];
    for (const item of items) {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.item.kind === item.kind && ultimo.item.title === item.title) ultimo.veces++;
        else grupos.push({ item, veces: 1 });
    }
    return grupos;
}

const CLAVE_ARRANQUE = 'estudia_arranque_oculto';

const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** El próximo día de semana con clases (desde mañana), con sus clases en orden */
function proximoDiaConClases(semana: ScheduleBlock[]): { fecha: string; etiqueta: string; bloques: ScheduleBlock[] } | null {
    for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const indice = d.getDay() - 1;
        if (indice < 0 || indice > 4) continue;
        const bloques = semana.filter(b => b.dayIndex === indice).sort((x, y) => x.startHour - y.startHour);
        if (bloques.length > 0) {
            return { fecha: fechaISO(d), etiqueta: i === 1 ? 'mañana' : d.toLocaleDateString('es-AR', { weekday: 'long' }), bloques };
        }
    }
    return null;
}

export default function Hoy() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [todayClasses, setTodayClasses] = useState<ScheduleBlock[]>([]);
    // Todo el horario: para saber si está cargado y qué viene el lunes
    const [semana, setSemana] = useState<ScheduleBlock[]>([]);
    const [stats, setStats] = useState<TeacherStats>({ totalStudents: 0, classesToday: 0, pendingEvaluations: 0, entregasParaCorregir: 0, avgAttendance: 0 });
    // Sin señal y sin copia guardada no hay datos: mostrar "0" o "Cargá tu
    // horario" confundía (parecía que no había nada).
    const [statsFallo, setStatsFallo] = useState(false);
    const [horarioFallo, setHorarioFallo] = useState(false);
    const [alerts, setAlerts] = useState<AlertType[]>([]);
    const [comunicadosSinLeer, setComunicadosSinLeer] = useState(0);
    const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
    const [attendanceDone, setAttendanceDone] = useState<Set<string>>(new Set());
    // Para arrancar (UX docente): qué ya hizo, con lo que esta pantalla lee igual
    const [arranque, setArranque] = useState({ temaPreparado: false, actividadPublicada: false, dioEnVivo: false });
    const [arranqueOculto, setArranqueOculto] = useState(() => {
        try { return localStorage.getItem(CLAVE_ARRANQUE) === '1'; } catch { return false; }
    });
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    // Temas donde el curso viene flojo (de actividades y clases en vivo)
    const { temas: temasRepaso } = useResumenRepaso(user?.id);
    const [loading, setLoading] = useState(true);
    // La planificación con fechas (062): para decir qué tema toca hoy
    const [planificacion, setPlanificacion] = useState<PlanningUnit[]>([]);
    // Si dirección cargó hoy como feriado, receso o jornada
    const [sinClaseHoy, setSinClaseHoy] = useState<DiaSinClase | null>(null);
    // Consultas de estudiantes sobre una actividad que esperan respuesta (066)
    const [consultas, setConsultas] = useState(0);

    useEffect(() => {
        if (!user) return;
        const hoy = hoyISO();
        getTemasConFecha(user.id).then(setPlanificacion).catch(() => setPlanificacion([]));
        consultasSinResponder()
            .then(l => setConsultas(l.reduce((t, c) => t + c.cantidad, 0)))
            .catch(() => setConsultas(0));
        getDiasSinClase(user.schoolId, Number(hoy.slice(0, 4)))
            .then(dias => setSinClaseHoy(dias.find(d => d.desde <= hoy && hoy <= d.hasta) ?? null))
            .catch(() => setSinClaseHoy(null));
    }, [user]);

    /** El último tema de ese año que ya arrancó para esa fecha, en esa materia y curso */
    const temaPara = (b: ScheduleBlock, fecha: string): PlanningClass | null => planificacion
        .filter(u => u.subjectId === b.subjectId && u.courseId === b.courseId)
        .flatMap(u => u.classes)
        .filter(c => c.fecha && c.fecha <= fecha && c.fecha.slice(0, 4) === fecha.slice(0, 4))
        .reduce<PlanningClass | null>((x, c) => (!x || (c.fecha ?? '') >= (x.fecha ?? '') ? c : x), null);
    const temaDeHoy = (b: ScheduleBlock): PlanningClass | null => (sinClaseHoy ? null : temaPara(b, hoyISO()));

    useEffect(() => {
        if (!user) return;
        // 0 = lunes … 4 = viernes; el fin de semana no hay clases (antes el
        // domingo mostraba las del viernes)
        const dia = new Date().getDay();
        const dayIndex = dia >= 1 && dia <= 5 ? dia - 1 : -1;
        const today = todayISO();

        Promise.all([
            getScheduleByTeacher(user.id).catch(() => null),
            getTeacherStats(user.id, dayIndex).catch(() => null),
            getAlertsByTeacher(user.id).catch(() => [] as AlertType[]),
            getRecentAttendance(user.id, 20).catch(() => []),
            getMyLiveSession(user.id).catch(() => null),
            getActivitiesByTeacher(user.id).catch(() => []),
            getMaterialsByTeacher(user.id).catch(() => []),
            getTeacherTimeline(user.id, 10).catch(() => [] as TimelineItem[]),
            getCommunicationsBySchool(user.schoolId).catch(() => [] as Communication[]),
            getMyPastSessions(user.id, 1).catch(() => [] as LiveSession[]),
        ]).then(([horarioLeido, st, al, attendance, live, activities, materials, trail, comunicados, pasadas]) => {
            const horario = horarioLeido ?? [];
            setHorarioFallo(horarioLeido === null);
            setSemana(horario);
            setTodayClasses(horario.filter(b => b.dayIndex === dayIndex).sort((a, b) => a.startHour - b.startHour));
            setStatsFallo(st === null);
            if (st) setStats(st);
            // Un alumno que pidió hablar va primero (051)
            const pidioHablar = (a: AlertType) => (a.title === 'Quiere hablar con vos' ? 0 : 1);
            setAlerts(al.filter(a => !a.isRead).sort((a, b) => pidioHablar(a) - pidioHablar(b)).slice(0, 3));
            setComunicadosSinLeer(sinLeer(comunicados, user.id).length);
            setLiveSession(live);
            // Tomada hoy: la que llegó al servidor y la que espera señal en este equipo
            setAttendanceDone(new Set([
                ...attendance.filter(a => a.takenOn === today).map(a => `${a.courseId}|${a.subjectId}`),
                ...pendientesDe('asistencia').filter(op => op.fecha === today).map(op => `${op.courseId}|${op.subjectId}`),
            ]));
            setArranque({
                temaPreparado: materials.some(m => m.classId) || activities.some(x => x.classId),
                actividadPublicada: activities.some(x => x.status === 'published'),
                dioEnVivo: pasadas.length > 0 || Boolean(live),
            });
            setTimeline(trail);
        }).catch(console.error).finally(() => setLoading(false));
    }, [user]);

    if (!user) return null;

    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const finDeSemana = [0, 6].includes(new Date().getDay());
    const nextIdx = todayClasses.findIndex(c => c.startHour + c.duration > nowHour);
    // Si hoy ya no queda ninguna (o no hay), la del próximo día con clases
    const proxima = !loading && nextIdx === -1 ? proximoDiaConClases(semana) : null;

    // ── Lo de hoy, en la tarjeta de Migue ──
    const claseAhora = nextIdx >= 0 ? todayClasses[nextIdx] : null;
    const temaAhora = claseAhora ? temaDeHoy(claseAhora) : null;
    const temaProximo = proxima ? proxima.bloques.map(b => temaPara(b, proxima.fecha)).find(Boolean) ?? null : null;
    // El tema del que más probablemente quiera hablar: el de ahora, o el que sigue
    const temaParaMigue = temaAhora ?? temaProximo;
    const titulo = loading ? 'Mirando tu día…'
        : sinClaseHoy ? `Hoy no hay clases: ${sinClaseHoy.motivo}`
        : todayClasses.length > 0 ? `Hoy tenés ${todayClasses.length} clase${todayClasses.length !== 1 ? 's' : ''}`
        : semana.length === 0 && !horarioFallo ? 'Empecemos por tu horario'
        : finDeSemana ? 'Es fin de semana' : 'Hoy no tenés clases';
    const bajada = loading ? '' : claseAhora
        ? `${claseAhora.startHour <= nowHour ? 'Ahora' : `A las ${horaATexto(claseAhora.startHour)}`}: ${claseAhora.subjectName} · ${claseAhora.courseName}${temaAhora ? `, toca «${temaAhora.title}»` : ''}.`
        : proxima ? `${proxima.etiqueta.charAt(0).toUpperCase()}${proxima.etiqueta.slice(1)}: ${proxima.bloques.length} clase${proxima.bloques.length !== 1 ? 's' : ''}${temaProximo ? `, la primera con «${temaProximo.title}»` : ''}.`
        : '';
    const pendientes = [
        consultas > 0 && { a: '/seguimiento', icono: HelpCircle, texto: `${consultas} consulta${consultas !== 1 ? 's' : ''} sin responder` },
        stats.pendingEvaluations > 0 && { a: '/corregir', icono: ClipboardCheck, texto: `${stats.pendingEvaluations} para corregir` },
        temasRepaso !== null && temasRepaso > 0 && { a: '/mis-clases?tab=repasar', icono: Target, texto: `${temasRepaso} tema${temasRepaso !== 1 ? 's' : ''} para repasar` },
        comunicadosSinLeer > 0 && { a: '/comunicados', icono: Megaphone, texto: `${comunicadosSinLeer} comunicado${comunicadosSinLeer !== 1 ? 's' : ''} de dirección` },
    ].filter((p): p is { a: string; icono: typeof HelpCircle; texto: string } => Boolean(p));

    // ── Para arrancar: lo que falta, según lo que ya hay (no según pasos tildados) ──
    const primerTemaSinPreparar = planificacion.flatMap(u => u.classes)
        .filter(c => !c.isComplete)
        .sort((x, y) => (x.fecha ?? '9999').localeCompare(y.fecha ?? '9999'))[0] ?? null;
    const temaSiguiente = temaParaMigue ?? primerTemaSinPreparar;
    const pasos = [
        { hecho: semana.length > 0, a: '/agenda?volver=/hoy', icono: CalendarDays, titulo: 'Cargá tu horario', detalle: 'Tus días y horas, una sola vez: de ahí sale todo lo de esta pantalla' },
        { hecho: planificacion.length > 0, a: '/planificacion', icono: CalendarRange, titulo: 'Subí tu programa', detalle: 'La IA arma las unidades y los temas, con fecha en tus días de clase' },
        { hecho: arranque.temaPreparado, a: temaSiguiente ? `/tema/${temaSiguiente.id}` : '/planificacion', icono: FolderOpen, titulo: 'Prepará un tema', detalle: 'Material, presentación y preguntas para la clase, todo en el tema' },
        { hecho: arranque.actividadPublicada, a: temaSiguiente ? `/actividades/nueva?tema=${temaSiguiente.id}` : '/actividades/nueva', icono: ClipboardList, titulo: 'Dejales una actividad', detalle: 'La hacen en el celular, aunque no tengan señal' },
        { hecho: arranque.dioEnVivo, a: temaSiguiente ? `/clase-en-vivo?tema=${temaSiguiente.id}` : '/clase-en-vivo', icono: Radio, titulo: 'Probá una clase en vivo', detalle: 'Participan desde el celular: preguntas, nube de palabras, competencia' },
    ];
    const hechos = pasos.filter(p => p.hecho).length;
    const mostrarArranque = !loading && !horarioFallo && !arranqueOculto && hechos < pasos.length;
    const ocultarArranque = () => {
        setArranqueOculto(true);
        try { localStorage.setItem(CLAVE_ARRANQUE, '1'); } catch { /* queda oculto hasta recargar */ }
    };

    return (
        <div className="hoy-container animate-in">
            {/* Clase en vivo abierta: lo primero */}
            {liveSession && (
                <Link to="/clase-en-vivo" className="card hoy-live-banner">
                    <span className="hoy-live-dot" />
                    <div>
                        <h4>Tenés una clase en vivo abierta</h4>
                        <p className="text-sm text-secondary">{liveSession.title} · tocá para volver al panel</p>
                    </div>
                    <ChevronRight size={18} className="text-subtle" />
                </Link>
            )}

            {/* Lo de hoy, con Migue: qué toca, qué espera y una puerta para preguntarle.
                El saludo y la fecha los pone la barra superior. */}
            <section className="card hoy-migue" aria-labelledby="hoy-migue-titulo">
                <div className="hoy-migue-cabecera">
                    <span className="hoy-migue-cara" aria-hidden="true"><img src="/migue-docente.jpeg" alt="" /></span>
                    <div>
                        <h2 id="hoy-migue-titulo">{titulo}</h2>
                        {bajada && <p className="text-secondary text-sm">{bajada}</p>}
                    </div>
                </div>
                {pendientes.length > 0 && (
                    <ul className="hoy-pendientes" aria-label="Lo que te espera">
                        {pendientes.map(p => (
                            <li key={p.a}>
                                <Link to={p.a} className="hoy-pendiente"><p.icono size={14} aria-hidden="true" /> {p.texto}</Link>
                            </li>
                        ))}
                    </ul>
                )}
                {!loading && (
                    <BotonMigue
                        contexto={temaParaMigue ? { tipo: 'tema', id: temaParaMigue.id, titulo: temaParaMigue.title } : null}
                        texto={temaParaMigue ? `Ideas para «${temaParaMigue.title.length > 34 ? `${temaParaMigue.title.slice(0, 33)}…` : temaParaMigue.title}»` : 'Preguntale a Migue'}
                    />
                )}
            </section>

            {/* Clases de hoy. Sin clases hoy (y con el horario cargado) no hace falta:
                lo dice la tarjeta de arriba y abajo está lo que viene */}
            {(loading || horarioFallo || semana.length === 0 || todayClasses.length > 0) && (
            <section className="hoy-classes">
                <h2 className="hoy-section-title"><Sun size={17} /> Tus clases de hoy</h2>

                {loading && <Esqueleto filas={2} etiqueta="Cargando tus clases de hoy…" />}

                {!loading && todayClasses.length === 0 && (
                    horarioFallo ? (
                        <EstadoVacio
                            compacto
                            icono={WifiOff}
                            titulo="Sin conexión"
                            texto="Tu horario no está guardado en este equipo. Con señal, tocá «Preparar para el aula» y queda para usar sin conexión."
                        />
                    ) : semana.length === 0 ? (
                        <EstadoVacio
                            compacto
                            icono={CalendarDays}
                            titulo="Cargá tu horario"
                            texto="Una sola vez: con tu horario, acá te aparece la próxima clase con pasar lista y preparar a un toque."
                            accion={{ etiqueta: 'Cargar mi horario', a: '/agenda?volver=/hoy', icono: CalendarDays }}
                        />
                    ) : null
                )}

                {sinClaseHoy && todayClasses.length > 0 && (
                    <p className="hoy-tema" role="note">
                        Según el calendario de la escuela, hoy no hay clases: <strong>{sinClaseHoy.motivo}</strong>.
                    </p>
                )}

                {todayClasses.map((cls, i) => {
                    const done = attendanceDone.has(`${cls.courseId}|${cls.subjectId}`);
                    const isNext = i === nextIdx;
                    const isPast = cls.startHour + cls.duration <= nowHour;
                    const tema = temaDeHoy(cls);
                    return (
                        <div key={cls.id} className={`card hoy-class ${isNext ? 'next' : ''} ${isPast ? 'past' : ''}`}>
                            <div className="hoy-class-time">
                                <span className="hoy-hour">{horaATexto(cls.startHour)}</span>
                                <span className="hoy-hour-end">{horaATexto(cls.startHour + cls.duration)}</span>
                                {isNext && <span className="hoy-next-pill">Ahora</span>}
                            </div>
                            <div className="hoy-class-body">
                                <h3><EmojiMateria nombre={cls.subjectName} /> {cls.subjectName}</h3>
                                <p className="hoy-class-meta">
                                    {[cls.courseName, cls.room, `${cls.studentCount} estudiante${cls.studentCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                                    {done && <span className="hoy-done-chip"><Check size={11} /> Asistencia tomada</span>}
                                </p>
                                {tema && (
                                    <p className="hoy-tema">
                                        Hoy toca: <strong>{tema.title}</strong>{tema.isComplete && ' (ya la marcaste como dada)'}
                                    </p>
                                )}
                                <div className="hoy-class-actions">
                                    <button
                                        className="hoy-action"
                                        onClick={() => navigate(tema ? `/tema/${tema.id}` : `/planificacion?materia=${cls.subjectId}&curso=${cls.courseId}`)}
                                        title={tema ? 'El material, el trabajo práctico y la evaluación del tema de hoy' : 'Armar la planificación de este curso'}
                                    >
                                        <Sparkles size={15} /> Preparar
                                    </button>
                                    <button
                                        className="hoy-action hoy-action-live"
                                        // Con el tema de hoy (y su material y sus preguntas) ya elegido
                                        onClick={() => navigate(tema ? `/clase-en-vivo?tema=${tema.id}` : `/clase-en-vivo?materia=${cls.subjectId}&curso=${cls.courseId}`)}
                                        title="Que participen desde el celular durante la clase"
                                    >
                                        <Radio size={15} /> Dar en vivo
                                    </button>
                                    <button
                                        className={`hoy-action ${done ? 'hoy-action-done' : ''}`}
                                        onClick={() => navigate(`/asistencia?curso=${cls.courseId}&materia=${cls.subjectId}`)}
                                        title="Pasar lista"
                                    >
                                        <CheckSquare size={15} /> {done ? 'Asistencia ✓' : 'Pasar lista'}
                                    </button>
                                    <button
                                        className="hoy-action"
                                        onClick={() => navigate(`/seguimiento?materia=${cls.subjectId}&curso=${cls.courseId}`)}
                                        title="Entregas, notas y cómo trabajaron"
                                    >
                                        <BarChart3 size={15} /> Cómo les fue
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </section>
            )}

            {/* La próxima clase: cuando hoy ya no queda ninguna, para dejarla preparada */}
            {proxima && (
                <section className="hoy-proxima" aria-labelledby="hoy-proxima-titulo">
                    <h2 id="hoy-proxima-titulo" className="hoy-section-title"><CalendarDays size={17} aria-hidden="true" /> {proxima.etiqueta.charAt(0).toUpperCase() + proxima.etiqueta.slice(1)}</h2>
                    <ul className="hoy-proxima-lista">
                        {proxima.bloques.map(b => {
                            const tema = temaPara(b, proxima.fecha);
                            return (
                                <li key={b.id} className="card hoy-proxima-item">
                                    <span className="hoy-hour">{horaATexto(b.startHour)}</span>
                                    <span className="hoy-proxima-texto">
                                        <strong><EmojiMateria nombre={b.subjectName} /> {b.subjectName} · {b.courseName}</strong>
                                        <small>{tema ? <>Toca: «{tema.title}»</> : 'Todavía sin tema en tu planificación'}</small>
                                    </span>
                                    <Link className="btn btn-outline btn-sm"
                                        to={tema ? `/tema/${tema.id}` : `/planificacion?materia=${b.subjectId}&curso=${b.courseId}`}>
                                        <Sparkles size={14} aria-hidden="true" /> Preparar
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {/* Para arrancar: los pasos se tildan solos con lo que ya hay */}
            {mostrarArranque && (
                <section className="card hoy-arranque" aria-labelledby="hoy-arranque-titulo">
                    <div className="hoy-arranque-cabecera">
                        <h2 id="hoy-arranque-titulo"><Rocket size={18} aria-hidden="true" /> Para arrancar</h2>
                        <span className="text-xs text-subtle">{hechos} de {pasos.length}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={ocultarArranque}>Ocultar</button>
                    </div>
                    <ol className="hoy-arranque-pasos">
                        {pasos.map(p => (
                            <li key={p.titulo} className={p.hecho ? 'hecho' : ''}>
                                <Link to={p.a} className="hoy-arranque-paso" aria-label={`${p.titulo}${p.hecho ? ' (listo)' : ''}`}>
                                    {p.hecho
                                        ? <CheckCircle2 size={18} className="hoy-arranque-check" aria-hidden="true" />
                                        : <p.icono size={18} aria-hidden="true" />}
                                    <span><strong>{p.titulo}</strong><small>{p.detalle}</small></span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {/* Lo que necesita atención */}
            {alerts.length > 0 && (
                <section className="hoy-alerts">
                    <h2 className="hoy-section-title"><AlertTriangle size={17} /> Necesita tu atención</h2>
                    {alerts.map(a => (
                        <Link
                            key={a.id}
                            to={a.studentIds?.length ? `/students?student=${a.studentIds[0]}` : '/students'}
                            className="card hoy-alert"
                        >
                            <span className={`hoy-alert-dot hoy-alert-${a.type}`} />
                            <p>{a.message}</p>
                            <ChevronRight size={16} className="text-subtle" />
                        </Link>
                    ))}
                </section>
            )}

            {/* Instalarla en el teléfono (solo celular; se puede cerrar): después de lo del día */}
            <InstalarApp variante="tarjeta" />

            {/* Tu rastro: lo que hiciste vos, con dato real */}
            {timeline.length > 0 && (
                <section className="hoy-timeline">
                    <h2 className="hoy-section-title"><History size={17} /> Lo que hiciste</h2>
                    <div className="hoy-trail">
                        {agruparRastro(timeline).map(({ item, veces }) => {
                            const meta = TIMELINE_META[item.kind];
                            const Icon = meta.icon;
                            const content = (
                                <>
                                    <span className={`hoy-trail-icon k-${item.kind}`}><Icon size={14} aria-hidden="true" /></span>
                                    <div className="hoy-trail-body">
                                        <span className="hoy-trail-label">
                                            {meta.label}
                                            {veces > 1 && <span className="hoy-trail-veces"> · {veces} veces</span>}
                                        </span>
                                        <strong>{item.title}</strong>
                                        {item.detail && <span className="hoy-trail-detail">{item.detail}</span>}
                                    </div>
                                    <span className="hoy-trail-when">{timeAgo(item.at)}</span>
                                </>
                            );
                            return item.link
                                ? <Link key={item.id} to={item.link} className="hoy-trail-item">{content}</Link>
                                : <div key={item.id} className="hoy-trail-item is-static">{content}</div>;
                        })}
                    </div>
                </section>
            )}

            {/* Para el aula sin señal: bajar todo con conexión */}
            <PrepararAula />

            {/* Contexto (métricas, en segundo plano). Sin "asistencia
                promedio": ese número sale de un campo que solo llena el seed
                de demo, ninguna función lo calcula. */}
            <section className="hoy-stats">
                <Link to="/students" className="hoy-stat hoy-stat-action">
                    <Users size={15} className="text-cyan" aria-hidden="true" />
                    <span className="hoy-stat-val">{statsFallo ? '—' : stats.totalStudents}</span>
                    <span className="hoy-stat-label">{stats.totalStudents === 1 ? 'estudiante' : 'estudiantes'}</span>
                </Link>
                <Link to="/mis-clases" className="hoy-stat hoy-stat-action">
                    <Clock size={15} className="text-warning" aria-hidden="true" />
                    <span className="hoy-stat-val">{statsFallo ? '—' : stats.classesToday}</span>
                    <span className="hoy-stat-label">{stats.classesToday === 1 ? 'clase hoy' : 'clases hoy'}</span>
                </Link>
                <Link
                    to="/corregir"
                    className="hoy-stat hoy-stat-action"
                    title="Ver y corregir todas las entregas pendientes"
                >
                    <ClipboardCheck size={15} className="text-ia-accent" aria-hidden="true" />
                    <span className="hoy-stat-val">{statsFallo ? '—' : stats.pendingEvaluations}</span>
                    <span className="hoy-stat-label">por corregir</span>
                </Link>
            </section>
        </div>
    );
}
