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
    Users, ClipboardCheck, ChevronRight, Check, Upload, Rocket, Boxes,
    History, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTodaySchedule } from '../services/schedule.service';
import { getTeacherStats, getTeacherTimeline, type TimelineItem, type TimelineKind } from '../services/stats.service';
import { getAlertsByTeacher } from '../services/alerts.service';
import { getRecentAttendance, todayISO } from '../services/attendance.service';
import { getMyLiveSession, type LiveSession } from '../services/live.service';
import { getActivitiesByTeacher } from '../services/activities.service';
import { getMaterialsByTeacher } from '../services/library.service';
import type { ScheduleBlock, Alert as AlertType, TeacherStats } from '../types';
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

function formatHour(h: number): string {
    const hh = Math.floor(h);
    const mm = h % 1 ? '30' : '00';
    return `${hh}:${mm}`;
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
    const [stats, setStats] = useState<TeacherStats>({ totalStudents: 0, classesToday: 0, pendingEvaluations: 0, avgAttendance: 0 });
    const [alerts, setAlerts] = useState<AlertType[]>([]);
    const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
    const [attendanceDone, setAttendanceDone] = useState<Set<string>>(new Set());
    const [isNew, setIsNew] = useState(false);
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const dayIndex = new Date().getDay() === 0 ? 4 : new Date().getDay() - 1;
        const today = todayISO();

        Promise.all([
            getTodaySchedule(user.id, dayIndex).catch(() => [] as ScheduleBlock[]),
            getTeacherStats(user.id, dayIndex).catch(() => stats),
            getAlertsByTeacher(user.id).catch(() => [] as AlertType[]),
            getRecentAttendance(user.id, 20).catch(() => []),
            getMyLiveSession(user.id).catch(() => null),
            getActivitiesByTeacher(user.id).catch(() => []),
            getMaterialsByTeacher(user.id).catch(() => []),
            getTeacherTimeline(user.id, 10).catch(() => [] as TimelineItem[]),
        ]).then(([classes, st, al, attendance, live, activities, materials, trail]) => {
            setTodayClasses(classes);
            setStats(st);
            setAlerts(al.filter(a => !a.isRead).slice(0, 3));
            setLiveSession(live);
            setAttendanceDone(new Set(
                attendance.filter(a => a.takenOn === today).map(a => `${a.courseId}|${a.subjectId}`),
            ));
            // Primera vez: sin material y sin actividades
            setIsNew(materials.length === 0 && activities.length === 0);
            setTimeline(trail);
        }).catch(console.error).finally(() => setLoading(false));
    }, [user]);

    if (!user) return null;

    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const nextIdx = todayClasses.findIndex(c => c.startHour + c.duration > nowHour);

    return (
        <div className="hoy-container animate-in">
            {/* Saludo */}
            <header className="hoy-greeting">
                <div>
                    <h1>{greeting()}, {user.firstName}</h1>
                    <p className="text-secondary">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {todayClasses.length > 0 && ` · ${todayClasses.length} clase${todayClasses.length !== 1 ? 's' : ''} hoy`}
                    </p>
                </div>
                <div className="hoy-header-actions">
                    <button className="btn btn-primary hoy-create-btn" onClick={() => navigate('/modulo')}>
                        <Boxes size={16} /> Armar módulo
                    </button>
                    <button className="btn btn-outline hoy-create-btn" onClick={() => navigate('/crear')}>
                        <Sparkles size={16} /> Actividad rápida
                    </button>
                </div>
            </header>

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
                        <Link to="/mis-clases?tab=materiales" className="hoy-onb-step">
                            <span className="hoy-onb-num">1</span>
                            <span className="hoy-onb-icon"><Upload size={17} /></span>
                            <div>
                                <strong>Subí un material</strong>
                                <span>Un PDF o Word que ya uses en clase</span>
                            </div>
                        </Link>
                        <Link to="/modulo" className="hoy-onb-step">
                            <span className="hoy-onb-num">2</span>
                            <span className="hoy-onb-icon"><Boxes size={17} /></span>
                            <div>
                                <strong>Armá tu primer módulo</strong>
                                <span>Un tema, y salen placas, podcast y actividad</span>
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

            {/* Clases de hoy */}
            <section className="hoy-classes">
                <h2 className="hoy-section-title"><Sun size={17} /> Tus clases de hoy</h2>

                {loading && <p className="text-secondary">Cargando...</p>}

                {!loading && todayClasses.length === 0 && (
                    <div className="card hoy-empty">
                        <p className="text-secondary">
                            Hoy no tenés clases en el horario. Igual podés preparar material o
                            revisar cómo viene tu curso.
                        </p>
                        <div className="hoy-empty-actions">
                            <button className="btn btn-primary btn-sm" onClick={() => navigate('/crear')}>
                                <Sparkles size={14} /> Crear actividad
                            </button>
                            <Link to="/students" className="btn btn-outline btn-sm">
                                <Users size={14} /> Ver estudiantes
                            </Link>
                        </div>
                    </div>
                )}

                {todayClasses.map((cls, i) => {
                    const done = attendanceDone.has(`${cls.courseId}|${cls.subjectId}`);
                    const isNext = i === nextIdx;
                    const isPast = cls.startHour + cls.duration <= nowHour;
                    return (
                        <div key={cls.id} className={`card hoy-class ${isNext ? 'next' : ''} ${isPast ? 'past' : ''}`}>
                            <div className="hoy-class-time">
                                <span className="hoy-hour">{formatHour(cls.startHour)}</span>
                                <span className="hoy-hour-end">{formatHour(cls.startHour + cls.duration)}</span>
                                {isNext && <span className="hoy-next-pill">Ahora</span>}
                            </div>
                            <div className="hoy-class-body">
                                <h3>{cls.subjectName}</h3>
                                <p className="hoy-class-meta">
                                    {cls.courseName} · {cls.room} · {cls.studentCount} estudiantes
                                    {done && <span className="hoy-done-chip"><Check size={11} /> Asistencia tomada</span>}
                                </p>
                                <div className="hoy-class-actions">
                                    <button
                                        className="hoy-action"
                                        onClick={() => navigate('/ia-lab')}
                                        title="Generar contenido, actividades o evaluaciones con IA"
                                    >
                                        <Sparkles size={15} /> Preparar
                                    </button>
                                    <button
                                        className="hoy-action hoy-action-live"
                                        onClick={() => navigate('/clase-en-vivo')}
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
                                        onClick={() => navigate(stats.pendingEvaluations > 0 ? '/corregir' : '/mis-clases?tab=actividades')}
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
                        {timeline.map(item => {
                            const meta = TIMELINE_META[item.kind];
                            const Icon = meta.icon;
                            const content = (
                                <>
                                    <span className={`hoy-trail-icon k-${item.kind}`}><Icon size={14} /></span>
                                    <div className="hoy-trail-body">
                                        <span className="hoy-trail-label">{meta.label}</span>
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

            {/* Contexto (métricas, en segundo plano) */}
            <section className="hoy-stats">
                <div className="hoy-stat">
                    <Users size={15} className="text-cyan" />
                    <span className="hoy-stat-val">{stats.totalStudents}</span>
                    <span className="hoy-stat-label">estudiantes</span>
                </div>
                <div className="hoy-stat">
                    <Clock size={15} className="text-warning" />
                    <span className="hoy-stat-val">{stats.classesToday}</span>
                    <span className="hoy-stat-label">clases hoy</span>
                </div>
                <button
                    className="hoy-stat hoy-stat-action"
                    onClick={() => navigate('/corregir')}
                    title="Ver y corregir todas las entregas pendientes"
                >
                    <ClipboardCheck size={15} className="text-ia-accent" />
                    <span className="hoy-stat-val">{stats.pendingEvaluations}</span>
                    <span className="hoy-stat-label">por corregir</span>
                </button>
                <div className="hoy-stat">
                    <CheckSquare size={15} className="text-success" />
                    <span className="hoy-stat-val">{stats.avgAttendance}%</span>
                    <span className="hoy-stat-label">asistencia</span>
                </div>
            </section>
        </div>
    );
}
