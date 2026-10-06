import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, MapPin, FlaskConical, CheckSquare, CalendarClock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getScheduleByTeacher, horaTexto } from '../services/schedule.service';
import HorarioSemanal from '../components/HorarioSemanal';
import { DIAS, colorDe, hoyIndice } from '../lib/horario';
import type { ScheduleBlock } from '../types';
import './Agenda.css';

/**
 * La semana del docente: sus clases según el horario que arma la dirección
 * (Gestión de la escuela → Horario). Tocando una clase: pasar lista o
 * prepararla.
 */
export default function Agenda() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null);
    const [myBlocks, setMyBlocks] = useState<ScheduleBlock[] | null>(null);

    useEffect(() => {
        if (!user) return;
        getScheduleByTeacher(user.id).then(setMyBlocks).catch(() => setMyBlocks([]));
    }, [user]);

    if (!user) return null;

    const horas = (myBlocks ?? []).reduce((n, b) => n + b.duration, 0);
    const cursos = new Set((myBlocks ?? []).map(b => b.courseId)).size;

    return (
        <div className="agenda-container">
            <div className="agenda-header card">
                <h2 className="agenda-title">Mi semana</h2>
                {myBlocks && myBlocks.length > 0 && (
                    <span className="text-secondary text-sm">
                        {myBlocks.length} clase{myBlocks.length !== 1 ? 's' : ''} · {horaTexto(horas)} h · {cursos} curso{cursos !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            <div className="card" style={{ padding: 'var(--space-4)' }}>
                {myBlocks === null ? <p className="text-secondary">Cargando…</p> : (
                    <HorarioSemanal
                        bloques={myBlocks}
                        etiqueta={b => ({ titulo: b.subjectName, detalle: b.courseName })}
                        onBloque={setSelectedBlock}
                        hoy={hoyIndice() ?? undefined}
                        vacio={
                            <div className="agenda-vacia">
                                <CalendarClock size={28} aria-hidden="true" />
                                <strong>Todavía no tenés clases en el horario</strong>
                                <p className="text-secondary text-sm">El horario lo carga la dirección de tu escuela en Gestión de la escuela → Horario. Apenas lo cargue, tus clases aparecen acá y en "Mi día".</p>
                            </div>
                        }
                    />
                )}
            </div>

            {/* Detalle de la clase */}
            {selectedBlock && (
                <div className="modal-overlay" onClick={() => setSelectedBlock(null)}>
                    <div className="modal-content card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Detalle de la clase</h3>
                            <button className="btn-icon" aria-label="Cerrar" onClick={() => setSelectedBlock(null)}><X size={20} /></button>
                        </div>

                        <div className={`modal-banner hs-${colorDe(selectedBlock.subjectId)}`} style={{ background: 'var(--hs-f)', borderLeft: '4px solid var(--hs-c)', color: 'var(--text-primary)' }}>
                            <h2>{selectedBlock.subjectName}</h2>
                            <p>{DIAS[selectedBlock.dayIndex]} · {horaTexto(selectedBlock.startHour)} – {horaTexto(selectedBlock.startHour + selectedBlock.duration)}</p>
                        </div>

                        <div className="modal-body">
                            <div className="detail-row">
                                <Users className="text-secondary" size={18} />
                                <div className="detail-text">
                                    <span className="detail-label">Curso</span>
                                    <span className="detail-value">{selectedBlock.courseName} ({selectedBlock.studentCount} est.)</span>
                                </div>
                            </div>
                            {selectedBlock.room && (
                                <div className="detail-row">
                                    <MapPin className="text-secondary" size={18} />
                                    <div className="detail-text">
                                        <span className="detail-label">Aula</span>
                                        <span className="detail-value">{selectedBlock.room}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn btn-primary w-full"
                                onClick={() => navigate(`/asistencia?curso=${selectedBlock.courseId}&materia=${selectedBlock.subjectId}`)}
                            >
                                <CheckSquare size={18} />
                                Pasar lista
                            </button>
                            <button
                                className="btn btn-outline w-full text-primary"
                                onClick={() => navigate('/ia-lab')}
                            >
                                <FlaskConical size={18} />
                                Preparar la clase
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
