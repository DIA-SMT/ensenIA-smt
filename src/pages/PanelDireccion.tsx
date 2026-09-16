/**
 * SMT EstudIA — Panel de dirección
 *
 * Lo que está pasando en la escuela, en una pantalla: qué clases están
 * en vivo ahora, cómo viene cada curso anímicamente, y qué hizo cada
 * docente con la herramienta.
 *
 * No es para controlar gente: es para que dirección sepa dónde hace
 * falta acompañar — a un curso que viene mal o a un docente que todavía
 * no arrancó.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Radio, HeartPulse, Users, Layers, ClipboardList, CheckSquare,
    ClipboardCheck, AlertTriangle, Activity,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getTeacherPulse, getSchoolClimate, getLiveNow,
    type TeacherPulse, type CourseClimateRow,
} from '../services/stats.service';
import './PanelDireccion.css';

const RANGES = [
    { days: 7, label: 'Última semana' },
    { days: 30, label: 'Último mes' },
    { days: 90, label: 'Trimestre' },
];

function moodClass(mood: number | null): string {
    if (mood === null) return 'none';
    if (mood >= 4.2) return 'great';
    if (mood >= 3.5) return 'good';
    if (mood >= 2.8) return 'mid';
    return 'low';
}

function relativeDate(iso: string | null): string {
    if (!iso) return 'Nunca usó la app';
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400_000);
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 30) return `Hace ${Math.floor(days / 7)} semana(s)`;
    return `Hace ${Math.floor(days / 30)} mes(es)`;
}

export default function PanelDireccion() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [days, setDays] = useState(30);
    const [pulse, setPulse] = useState<TeacherPulse[]>([]);
    const [climate, setClimate] = useState<CourseClimateRow[]>([]);
    const [liveNow, setLiveNow] = useState<{ id: string; title: string; teacherId: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        setError('');
        Promise.all([
            getTeacherPulse(days),
            getSchoolClimate(days),
            getLiveNow().catch(() => []),
        ]).then(([p, c, l]) => {
            setPulse(p);
            setClimate(c);
            setLiveNow(l);
        }).catch(err => {
            console.error(err);
            setError('No se pudieron cargar los datos de la escuela.');
        }).finally(() => setLoading(false));
    }, [user, days]);

    if (!user) return null;

    const teacherName = (id: string) => pulse.find(t => t.teacherId === id)?.teacherName ?? 'Docente';
    const totalPending = pulse.reduce((a, t) => a + t.pendingGrading, 0);
    const atRisk = climate.reduce((a, c) => a + c.studentsAtRisk, 0);
    const inactive = pulse.filter(t => !t.lastActive).length;
    const withCheckins = climate.filter(c => c.checkins > 0);
    const schoolMood = withCheckins.length > 0
        ? withCheckins.reduce((a, c) => a + (c.mood ?? 0), 0) / withCheckins.length
        : null;

    return (
        <div className="pd-container animate-in">
            <header className="pd-header">
                <div>
                    <h1>Qué está pasando</h1>
                    <p className="text-secondary text-sm">
                        El pulso de la escuela: cursos, docentes y aulas en vivo.
                    </p>
                </div>
                <div className="pd-ranges">
                    {RANGES.map(r => (
                        <button
                            key={r.days}
                            className={`pd-range ${days === r.days ? 'active' : ''}`}
                            onClick={() => setDays(r.days)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </header>

            {error && <div className="pd-error"><AlertTriangle size={15} /> {error}</div>}
            {loading && <p className="text-secondary">Leyendo el pulso de la escuela...</p>}

            {!loading && !error && (
                <>
                    {/* Resumen */}
                    <div className="pd-summary">
                        <div className={`pd-sum-card mood-${moodClass(schoolMood)}`}>
                            <HeartPulse size={17} />
                            <span className="pd-sum-val">{schoolMood !== null ? schoolMood.toFixed(1) : '—'}</span>
                            <span className="pd-sum-label">ánimo de la escuela</span>
                        </div>
                        <div className="pd-sum-card">
                            <Radio size={17} className={liveNow.length > 0 ? 'text-danger' : ''} />
                            <span className="pd-sum-val">{liveNow.length}</span>
                            <span className="pd-sum-label">clases en vivo ahora</span>
                        </div>
                        <div className="pd-sum-card">
                            <AlertTriangle size={17} className={atRisk > 0 ? 'text-warning' : ''} />
                            <span className="pd-sum-val">{atRisk}</span>
                            <span className="pd-sum-label">estudiantes a acompañar</span>
                        </div>
                        <div className="pd-sum-card">
                            <ClipboardCheck size={17} />
                            <span className="pd-sum-val">{totalPending}</span>
                            <span className="pd-sum-label">entregas sin corregir</span>
                        </div>
                    </div>

                    {/* En vivo ahora */}
                    {liveNow.length > 0 && (
                        <section className="card pd-section pd-live">
                            <h3 className="pd-title"><Radio size={16} className="text-danger" /> Aulas en vivo en este momento</h3>
                            <div className="pd-live-list">
                                {liveNow.map(l => (
                                    <div key={l.id} className="pd-live-item">
                                        <span className="pd-live-dot" />
                                        <div>
                                            <strong>{l.title}</strong>
                                            <span>{teacherName(l.teacherId)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Clima por curso */}
                    <section className="card pd-section">
                        <h3 className="pd-title"><HeartPulse size={16} /> Cómo viene cada curso</h3>
                        <p className="text-sm text-secondary">
                            Sale de lo que los propios estudiantes dicen sentir. No es una nota ni una evaluación.
                        </p>
                        <div className="pd-courses">
                            {climate.map(c => (
                                <div key={c.courseId} className={`pd-course mood-${moodClass(c.mood)}`}>
                                    <div className="pd-course-head">
                                        <strong>{c.courseName}</strong>
                                        <span className="pd-course-mood">
                                            {c.mood !== null ? c.mood.toFixed(1) : 'sin datos'}
                                        </span>
                                    </div>
                                    <div className="pd-course-bar">
                                        <div
                                            className="pd-course-fill"
                                            style={{ width: c.mood !== null ? `${(c.mood / 5) * 100}%` : '0%' }}
                                        />
                                    </div>
                                    <div className="pd-course-meta">
                                        <span>{c.checkins} check-in{c.checkins !== 1 ? 's' : ''}</span>
                                        {c.studentsAtRisk > 0 && (
                                            <span className="pd-course-risk">
                                                <AlertTriangle size={11} /> {c.studentsAtRisk} a acompañar
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Docentes */}
                    <section className="card pd-section">
                        <h3 className="pd-title"><Users size={16} /> Qué hizo cada docente</h3>
                        <p className="text-sm text-secondary">
                            Para saber a quién hay que acompañar, no para controlar.
                            {inactive > 0 && ` ${inactive} docente(s) todavía no usaron la app.`}
                        </p>
                        <div className="pd-teachers">
                            {pulse.map(t => {
                                const total = t.materials + t.activities + t.liveClasses + t.attendanceTaken;
                                return (
                                    <div key={t.teacherId} className={`pd-teacher ${total === 0 ? 'quiet' : ''}`}>
                                        <div className="pd-teacher-head">
                                            <strong>{t.teacherName}</strong>
                                            <span className={`pd-last ${!t.lastActive ? 'never' : ''}`}>
                                                {relativeDate(t.lastActive)}
                                            </span>
                                        </div>
                                        <div className="pd-teacher-stats">
                                            <span title="Materiales subidos o generados"><Layers size={12} /> {t.materials}</span>
                                            <span title="Actividades creadas"><ClipboardList size={12} /> {t.activities}</span>
                                            <span title="Clases en vivo dadas"><Radio size={12} /> {t.liveClasses}</span>
                                            <span title="Veces que pasó lista"><CheckSquare size={12} /> {t.attendanceTaken}</span>
                                            <span title="Entregas corregidas"><ClipboardCheck size={12} /> {t.graded}</span>
                                            {t.pendingGrading > 0 && (
                                                <span className="pd-teacher-pending" title="Entregas esperando corrección">
                                                    {t.pendingGrading} sin corregir
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <button className="btn btn-outline btn-sm pd-more" onClick={() => navigate('/alerts')}>
                        <Activity size={14} /> Ver las alertas de la escuela
                    </button>
                </>
            )}
        </div>
    );
}
