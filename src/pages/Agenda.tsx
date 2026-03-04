import { useState, useEffect } from 'react';
import { X, Users, MapPin, FlaskConical, CheckSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getScheduleByTeacher } from '../services/schedule.service';
import type { ScheduleBlock } from '../types';
import './Agenda.css';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const hours = Array.from({ length: 9 }, (_, i) => i + 8); // 8:00 to 16:00

const blockColors: Record<string, string> = {
    green: 'block-blue',
    blue: 'block-green',
    purple: 'block-purple',
    orange: 'block-orange',
    amber: 'block-orange',
    teal: 'block-blue',
};

function formatHourLabel(h: number): string {
    const hh = Math.floor(h);
    const mm = h % 1 ? '30' : '00';
    return `${hh}:${mm}`;
}

export default function Agenda() {
    const { user } = useAuth();
    const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null);
    const [myBlocks, setMyBlocks] = useState<ScheduleBlock[]>([]);

    useEffect(() => {
        if (!user) return;
        getScheduleByTeacher(user.id).then(setMyBlocks).catch(console.error);
    }, [user]);

    if (!user) return null;

    // Get current week dates
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const todayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Mon=0

    const weekDates = days.map((_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.getDate();
    });

    const weekLabel = `Semana ${monday.getDate()} - ${weekDates[4]} ${today.toLocaleDateString('es-AR', { month: 'long' })}`;

    return (
        <div className="agenda-container">
            <div className="agenda-header card">
                <h2 className="agenda-title">Mi Agenda</h2>
                <div className="agenda-controls">
                    <button className="btn btn-outline">Hoy</button>
                    <button className="btn btn-ghost">&lt;</button>
                    <span className="current-week">{weekLabel}</span>
                    <button className="btn btn-ghost">&gt;</button>
                </div>
            </div>

            <div className="calendar-grid card">
                <div className="time-col">
                    <div className="header-cell"></div>
                    {hours.map(h => (
                        <div key={h} className="time-cell">
                            <span>{h}:00</span>
                        </div>
                    ))}
                </div>

                <div className="days-wrapper">
                    <div className="days-header">
                        {days.map((day, idx) => (
                            <div key={day} className={`day-header-cell ${idx === todayIndex ? 'today' : ''}`}>
                                <span className="day-name">{day}</span>
                                <span className="day-date">{weekDates[idx]}</span>
                            </div>
                        ))}
                    </div>

                    <div className="days-grid-content">
                        {/* Background Grid Lines */}
                        <div className="grid-lines">
                            {hours.map(h => (
                                <div key={h} className="grid-row"></div>
                            ))}
                        </div>

                        {/* Schedule Blocks */}
                        {myBlocks.map(block => (
                            <div
                                key={block.id}
                                className={`schedule-block ${blockColors[block.colorClass] || 'block-blue'}`}
                                style={{
                                    gridColumn: block.dayIndex + 1,
                                    top: `${(block.startHour - 8) * 60}px`,
                                    height: `${block.duration * 60}px`
                                }}
                                onClick={() => setSelectedBlock(block)}
                            >
                                <div className="block-title">{block.subjectName}</div>
                                <div className="block-details">
                                    <span>{block.courseName}</span> • <span>{block.room}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedBlock && (
                <div className="modal-overlay" onClick={() => setSelectedBlock(null)}>
                    <div className="modal-content card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Detalle de Clase</h3>
                            <button className="btn-icon" onClick={() => setSelectedBlock(null)}><X size={20} /></button>
                        </div>

                        <div className={`modal-banner ${blockColors[selectedBlock.colorClass] || 'block-blue'}`}>
                            <h2>{selectedBlock.subjectName}</h2>
                            <p>{formatHourLabel(selectedBlock.startHour)} - {formatHourLabel(selectedBlock.startHour + selectedBlock.duration)}</p>
                        </div>

                        <div className="modal-body">
                            <div className="detail-row">
                                <Users className="text-secondary" size={18} />
                                <div className="detail-text">
                                    <span className="detail-label">Curso</span>
                                    <span className="detail-value">{selectedBlock.courseName} ({selectedBlock.studentCount} est.)</span>
                                </div>
                            </div>
                            <div className="detail-row">
                                <MapPin className="text-secondary" size={18} />
                                <div className="detail-text">
                                    <span className="detail-label">Aula</span>
                                    <span className="detail-value">{selectedBlock.room}</span>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-primary w-full">
                                <CheckSquare size={18} />
                                Tomar Asistencia
                            </button>
                            <button className="btn btn-outline w-full text-primary">
                                <FlaskConical size={18} />
                                Abrir Laboratorio IA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
