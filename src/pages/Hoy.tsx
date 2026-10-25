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
    History, ClipboardList, Wand2, CalendarDays, Target, WifiOff, Megaphone,
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
import { getMyLiveSession, type LiveSession } from '../services/live.service';
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
    modulo: { icon: Boxes, label: 'Armaste un módulo' },
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

function greeting(): string {
    const h = new Date().getHours();
    if (h < 13) return 'Buen día';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
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
    const [isNew, setIsNew] = useState(false);
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

    /** El último tema de este año que ya arrancó en esa materia y curso */
    const temaDeHoy = (b: ScheduleBlock): PlanningClass | null => {
        if (sinClaseHoy) return null;
        const hoy = hoyISO();
        return planificacion
            .filter(u => u.subjectId === b.subjectId && u.courseId === b.courseId)
            .flatMap(u => u.classes)
            .filter(c => c.fecha && c.fecha <= hoy && c.fecha.slice(0, 4) === hoy.slice(0, 4))
            .reduce<PlanningClass | null>((a, c) => (!a || (c.fecha ?? '') >= (a.fecha ?? '') ? c : a), null);
    };

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
        ]).then(([horarioLeido, st, al, attendance, live, activities, materials, trail, comunicados]) => {
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
            // Primera vez: sin material y sin actividades
            setIsNew(materials.length === 0 && activities.length === 0);
            setTimeline(trail);
        }).catch(console.error).finally(() => setLoading(false));
    }, [user]);

    if (!user) return null;

    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const finDeSemana = [0, 6].includes(new Date().getDay());
    const lunes = semana.filter(b => b.dayIndex === 0).length;
    const nextIdx = todayClasses.findIndex(c => c.startHour + c.duration > nowHour);

    return (
        <div className="hoy-container animate-in">
            {/* Saludo. El <h1> de la pantalla ("Mi día") lo pone la barra superior. */}
            <header className="hoy-greeting">
                <div>
                    <h2 className="hoy-saludo">{greeting()}, {user.firstName}</h2>
                    <p className="text-secondary">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {todayClasses.length > 0 && ` · ${todayClasses.length} clase${todayClasses.length !== 1 ? 's' : ''} hoy`}
                    </p>
                </div>
                {/* Crear está en la barra superior, en todas las pantallas */}
            </header>

            {/* Instalarla en el teléfono (solo celular; se puede cerrar) */}
            <InstalarApp variante="tarjeta" />

            {/* Primer uso */}
            {isNew && !loading && (
                <section className="card hoy-onboarding">
                    <div className="hoy-onb-head">
                        <Rocket size={20} className="text-ia-accent" />
                        <h3>Bienvenido a SMT EstudIA</h3>
                    </div>
                    <p className="text-secondary text-sm">
                        Tres pasos y ya estás andando. No hace falta saber nada de IA: la app te guía.
                    </p>
                    <div className="hoy-onb-steps">
                        <Link to="/biblioteca?subir=archivo" className="hoy-onb-step">
                            <span className="hoy-onb-num">1</span>
                            <span className="hoy-onb-icon"><Upload size={17} /></span>
                            <div>
                                <strong>Subí o escaneá tu material</strong>
                                <span>Lo que ya usás en clase: PDF, Word, PowerPoint o tus hojas con la cámara</span>
                            </div>
                        </Link>
                        <Link to="/modulo" className="hoy-onb-step">
                            <span className="hoy-onb-num">2</span>
                            <span className="hoy-onb-icon"><Boxes size={17} /></span>
                            <div>
                                <strong>Armá tu primera clase</strong>
                                <span>Un tema, y salen diapositivas, juego y tarea</span>
                            </div>
                        </Link>
                        <Link to="/clase-en-vivo" className="hoy-onb-step">
                            <span className="hoy-onb-num">3</span>
                            <span className="hoy-onb-icon"><Radio size={17} /></span>
                            <div>
                                <strong>Probá una clase en vivo</strong>
                                <span>Tus estudiantes participan desde el celular</span>
                            </div>
                        </Link>
                    </div>
                </section>
            )}

            {/* Clase en vivo activa */}
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

            {/* Estudiantes que preguntaron algo de una actividad */}
            {consultas > 0 && (
                <Link to="/seguimiento" className="card hoy-pending-banner">
                    <span className="hoy-pending-icon"><HelpCircle size={18} /></span>
                    <div>
                        <h4>
                            {consultas} consulta{consultas !== 1 ? 's' : ''} de estudiantes sin responder
                        </h4>
                        <p className="text-sm text-secondary">
                            Respondé ahí mismo, a quien preguntó o para todo el curso.
                        </p>
                    </div>
                    <ChevronRight size={18} className="text-subtle" />
                </Link>
            )}

            {/* Hay entregas esperando nota */}
            {stats.pendingEvaluations > 0 && (
                <Link to="/corregir" className="card hoy-pending-banner">
                    <span className="hoy-pending-icon"><ClipboardCheck size={18} /></span>
                    <div>
                        <h4>
                            {stats.pendingEvaluations} entrega{stats.pendingEvaluations !== 1 ? 's' : ''} esperando tu nota
                        </h4>
                        <p className="text-sm text-secondary">
                            Corregilas todas de una, con las respuestas a la vista.
                        </p>
                    </div>
                    <ChevronRight size={18} className="text-subtle" />
                </Link>
            )}

            {/* Hay temas que el curso no entendió */}
            {temasRepaso !== null && temasRepaso > 0 && (
                <Link to="/mis-clases?tab=repasar" className="card hoy-pending-banner hoy-repaso-banner">
                    <span className="hoy-pending-icon"><Target size={18} aria-hidden="true" /></span>
                    <div>
                        <h4>{temasRepaso === 1 ? 'Hay un tema para repasar' : `Hay ${temasRepaso} temas para repasar`}</h4>
                        <p className="text-sm text-secondary">
                            Menos de 6 de cada 10 acertaron en actividades o en la clase en vivo.
                        </p>
                    </div>
                    <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
                </Link>
            )}

            {/* Clases de hoy */}
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
                            accion={{ etiqueta: 'Cargar mi horario', a: '/mis-clases', icono: CalendarDays }}
                        />
                    ) : (
                        <EstadoVacio
                            compacto
                            icono={CalendarDays}
                            titulo={finDeSemana ? 'Es fin de semana' : 'Hoy no tenés clases'}
                            texto={finDeSemana
                                ? (lunes > 0 ? `El lunes tenés ${lunes} clase${lunes !== 1 ? 's' : ''}. Si querés, dejá algo preparado.` : 'Buen momento para preparar material.')
                                : 'Buen momento para preparar material o ver cómo viene tu curso.'}
                            accion={{ etiqueta: 'Crear', a: '/crear', icono: Wand2 }}
                            accionSecundaria={{ etiqueta: 'Ver mi horario', a: '/mis-clases' }}
                        />
                    )
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
                                        onClick={() => navigate(stats.pendingEvaluations > 0 ? '/corregir' : '/actividades')}
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

            {/* Comunicados de dirección sin leer (051) */}
            {comunicadosSinLeer > 0 && (
                <Link to="/comunicados" className="card hoy-comunicados">
                    <Megaphone size={18} aria-hidden="true" />
                    <span>
                        <strong>Dirección te mandó {comunicadosSinLeer === 1 ? 'un comunicado' : `${comunicadosSinLeer} comunicados`}</strong>
                        <small>Tocá para leer{comunicadosSinLeer === 1 ? 'lo' : 'los'}</small>
                    </span>
                    <ChevronRight size={16} className="text-subtle" aria-hidden="true" />
                </Link>
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
