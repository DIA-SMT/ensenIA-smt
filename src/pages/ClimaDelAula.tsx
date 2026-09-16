/**
 * SMT EstudIA — Clima del aula
 *
 * Los estudiantes vienen diciendo cómo se sienten desde hace tiempo, pero
 * esa información solo se veía de a un estudiante por vez. Acá el docente
 * ve el pulso del curso completo: cómo viene el ánimo, si sube o baja,
 * qué escribieron y quién necesita que alguien se le acerque.
 *
 * No es una métrica de rendimiento ni se califica: es información para
 * que el docente decida algo distinto mañana.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    HeartPulse, TrendingUp, TrendingDown, Minus, MessageCircle,
    UserRound, ChevronRight, Info,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getCourseClimate, type CourseClimate } from '../services/wellbeing.service';
import { FEELING_META, type Subject, type CheckinFeeling } from '../types';
import './ClimaDelAula.css';

const RANGES = [
    { days: 7, label: 'Última semana' },
    { days: 30, label: 'Último mes' },
    { days: 90, label: 'Últimos 3 meses' },
];

function moodLabel(avg: number): { text: string; cls: string } {
    if (avg >= 4.2) return { text: 'El curso viene muy bien', cls: 'great' };
    if (avg >= 3.5) return { text: 'El curso viene bien', cls: 'good' };
    if (avg >= 2.8) return { text: 'Hay cosas para mirar', cls: 'mid' };
    return { text: 'El curso la está pasando mal', cls: 'low' };
}

export default function ClimaDelAula() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [days, setDays] = useState(30);
    const [climate, setClimate] = useState<CourseClimate | null>(null);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [loading, setLoading] = useState(true);

    // Un docente puede dar varias materias en el mismo curso: el clima es del curso
    const courses = (user?.subjects ?? []).reduce<{ courseId: string; courseName: string }[]>((acc, a) => {
        if (!acc.some(c => c.courseId === a.courseId)) {
            acc.push({ courseId: a.courseId, courseName: a.courseName });
        }
        return acc;
    }, []);
    const current = courses[assignmentIdx];

    useEffect(() => {
        getSubjects().then(subjects => {
            const map: Record<string, Subject> = {};
            subjects.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, []);

    const load = useCallback(async () => {
        if (!current) return;
        setLoading(true);
        try {
            setClimate(await getCourseClimate(current.courseId, days));
        } catch (err) {
            console.error(err);
            setClimate(null);
        } finally {
            setLoading(false);
        }
    }, [current?.courseId, days]);

    useEffect(() => { load(); }, [load]);

    if (!user) return null;
    void subjectsMap;

    const maxDay = climate ? Math.max(1, ...climate.byDay.map(d => d.count)) : 1;
    const totalDist = climate ? Object.values(climate.distribution).reduce((a, b) => a + b, 0) : 0;

    return (
        <div className="clima-container animate-in">
            <div className="clima-controls">
                {courses.length > 1 && (
                    <select
                        className="form-select"
                        value={assignmentIdx}
                        onChange={e => setAssignmentIdx(Number(e.target.value))}
                    >
                        {courses.map((c, i) => (
                            <option key={c.courseId} value={i}>{c.courseName}</option>
                        ))}
                    </select>
                )}
                <div className="clima-ranges">
                    {RANGES.map(r => (
                        <button
                            key={r.days}
                            className={`clima-range ${days === r.days ? 'active' : ''}`}
                            onClick={() => setDays(r.days)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <p className="text-secondary">Leyendo el pulso del curso...</p>}

            {!loading && (!climate || climate.total === 0) && (
                <div className="card clima-empty">
                    <HeartPulse size={34} className="text-cyan" />
                    <h3>Todavía no hay señales de este curso</h3>
                    <p className="text-secondary text-sm">
                        Cuando tus estudiantes hagan su check-in — desde su pantalla o durante
                        una clase en vivo — acá vas a ver cómo viene el ánimo del grupo.
                    </p>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/clase-en-vivo')}>
                        Lanzar un check-in en vivo
                    </button>
                </div>
            )}

            {!loading && climate && climate.total > 0 && (
                <>
                    {/* Pulso general */}
                    <div className={`card clima-hero clima-${moodLabel(climate.avg ?? 3).cls}`}>
                        <div className="clima-hero-main">
                            <span className="clima-score">{(climate.avg ?? 0).toFixed(1)}</span>
                            <div>
                                <h2>{moodLabel(climate.avg ?? 3).text}</h2>
                                <p className="text-sm text-secondary">
                                    Promedio sobre 5, con {climate.total} check-in{climate.total !== 1 ? 's' : ''} de {current?.courseName}
                                </p>
                            </div>
                        </div>
                        {climate.trend !== null && (
                            <span className={`clima-trend ${climate.trend > 0.2 ? 'up' : climate.trend < -0.2 ? 'down' : 'flat'}`}>
                                {climate.trend > 0.2 ? <TrendingUp size={15} /> : climate.trend < -0.2 ? <TrendingDown size={15} /> : <Minus size={15} />}
                                {climate.trend > 0.2 ? 'Mejorando' : climate.trend < -0.2 ? 'Bajando' : 'Estable'}
                            </span>
                        )}
                    </div>

                    {/* Cómo se repartieron */}
                    <section className="card clima-section">
                        <h3 className="clima-title">Cómo se sintieron</h3>
                        <div className="clima-dist">
                            {(Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][]).map(([key, meta]) => {
                                const n = climate.distribution[key] ?? 0;
                                const pct = totalDist > 0 ? (n / totalDist) * 100 : 0;
                                return (
                                    <div key={key} className="clima-dist-row">
                                        <span className="clima-dist-label">{meta.emoji} {meta.label}</span>
                                        <div className="clima-dist-track">
                                            <div className={`clima-dist-fill f-${key}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="clima-dist-n">{n}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Evolución por día */}
                    {climate.byDay.length > 1 && (
                        <section className="card clima-section">
                            <h3 className="clima-title">Día a día</h3>
                            <div className="clima-chart">
                                {climate.byDay.map(d => (
                                    <div key={d.date} className="clima-bar-wrap" title={`${d.count} check-in(s) · promedio ${d.avg.toFixed(1)}`}>
                                        <div className="clima-bar-track">
                                            <div
                                                className={`clima-bar ${d.avg >= 3.5 ? 'ok' : d.avg >= 2.8 ? 'mid' : 'low'}`}
                                                style={{ height: `${(d.avg / 5) * 100}%` }}
                                            />
                                        </div>
                                        <span className="clima-bar-date">
                                            {new Date(d.date + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                        <span className="clima-bar-count" style={{ opacity: 0.4 + (d.count / maxDay) * 0.6 }}>
                                            {d.count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="clima-hint"><Info size={12} /> La altura es el ánimo promedio; el número de abajo, cuántos respondieron.</p>
                        </section>
                    )}

                    {/* Quién necesita que se le acerquen */}
                    {climate.needsAttention.length > 0 && (
                        <section className="card clima-section clima-attention">
                            <h3 className="clima-title">
                                <UserRound size={15} /> Alguien debería acercarse
                            </h3>
                            <p className="text-sm text-secondary">
                                Marcaron sentirse confundidos o frustrados más de una vez en este período.
                            </p>
                            <div className="clima-students">
                                {climate.needsAttention.map(s => (
                                    <button
                                        key={s.studentId}
                                        className="clima-student"
                                        onClick={() => navigate('/students')}
                                        title="Abrir la sección Estudiantes"
                                    >
                                        <span className="clima-student-emoji">{FEELING_META[s.lastFeeling].emoji}</span>
                                        <div>
                                            <strong>{s.studentName}</strong>
                                            <span>{s.negatives} de {s.total} check-ins difíciles</span>
                                        </div>
                                        <ChevronRight size={16} className="text-subtle" />
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Lo que escribieron */}
                    {climate.comments.length > 0 && (
                        <section className="card clima-section">
                            <h3 className="clima-title"><MessageCircle size={15} /> Lo que escribieron</h3>
                            <div className="clima-comments">
                                {climate.comments.map((c, i) => (
                                    <div key={i} className="clima-comment">
                                        <span className="clima-comment-emoji">{FEELING_META[c.feeling].emoji}</span>
                                        <div>
                                            <p>"{c.comment}"</p>
                                            <span className="clima-comment-meta">
                                                {c.studentName} · {new Date(c.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
