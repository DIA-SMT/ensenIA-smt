import { useState } from 'react';
import { X, Users, MapPin, FlaskConical, CheckSquare } from 'lucide-react';
import './Agenda.css';

interface ClassBlock {
    id: string;
    day: number; // 0 (Mon) to 4 (Fri)
    startHour: number; // e.g., 8.5 for 08:30
    duration: number; // in hours, e.g., 1.5
    subject: string;
    course: string;
    room: string;
    colorClass: string;
    studentsCount: number;
}

const scheduleBlocks: ClassBlock[] = [
    { id: '1', day: 0, startHour: 8, duration: 2, subject: 'Biología Celular', course: '4to 2da', room: 'Aula 12', colorClass: 'block-blue', studentsCount: 28 },
    { id: '2', day: 0, startHour: 10.5, duration: 1.5, subject: 'Física', course: '5to 1ra', room: 'Laboratorio', colorClass: 'block-green', studentsCount: 24 },
    { id: '3', day: 1, startHour: 9, duration: 2, subject: 'Química Orgánica', course: '5to 2da', room: 'Laboratorio', colorClass: 'block-purple', studentsCount: 22 },
    { id: '4', day: 2, startHour: 8, duration: 1.5, subject: 'Biología Celular', course: '4to 1ra', room: 'Aula 11', colorClass: 'block-blue', studentsCount: 30 },
    { id: '5', day: 2, startHour: 10, duration: 2, subject: 'Física', course: '5to 1ra', room: 'Aula 14', colorClass: 'block-green', studentsCount: 24 },
    { id: '6', day: 3, startHour: 13, duration: 2, subject: 'Anatomía', course: '6to 1ra', room: 'Aula 9', colorClass: 'block-orange', studentsCount: 18 },
    { id: '7', day: 4, startHour: 9, duration: 3, subject: 'Laboratorio Práctico', course: '5to 2da', room: 'Laboratorio', colorClass: 'block-purple', studentsCount: 22 },
];

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const hours = Array.from({ length: 9 }, (_, i) => i + 8); // 8:00 to 16:00

export default function Agenda() {
    const [selectedBlock, setSelectedBlock] = useState<ClassBlock | null>(null);

    const handleBlockClick = (block: ClassBlock) => {
        setSelectedBlock(block);
    };

    const closeModal = () => setSelectedBlock(null);

    return (
        <div className="agenda-container">
            <div className="agenda-header card">
                <h2 className="agenda-title">Mi Agenda</h2>
                <div className="agenda-controls">
                    <button className="btn btn-outline">Hoy</button>
                    <button className="btn btn-ghost">&lt;</button>
                    <span className="current-week">Semana 15 - 19 Mayo</span>
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
                            <div key={day} className={`day-header-cell ${idx === 2 ? 'today' : ''}`}>
                                <span className="day-name">{day}</span>
                                <span className="day-date">{15 + idx}</span>
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
                        {scheduleBlocks.map(block => (
                            <div
                                key={block.id}
                                className={`schedule-block ${block.colorClass}`}
                                style={{
                                    gridColumn: block.day + 1,
                                    top: `${(block.startHour - 8) * 60}px`,
                                    height: `${block.duration * 60}px`
                                }}
                                onClick={() => handleBlockClick(block)}
                            >
                                <div className="block-title">{block.subject}</div>
                                <div className="block-details">
                                    <span>{block.course}</span> • <span>{block.room}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedBlock && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Detalle de Clase</h3>
                            <button className="btn-icon" onClick={closeModal}><X size={20} /></button>
                        </div>

                        <div className={`modal-banner ${selectedBlock.colorClass}`}>
                            <h2>{selectedBlock.subject}</h2>
                            <p>{selectedBlock.startHour}:00 - {selectedBlock.startHour + selectedBlock.duration}:00</p>
                        </div>

                        <div className="modal-body">
                            <div className="detail-row">
                                <Users className="text-secondary" size={18} />
                                <div className="detail-text">
                                    <span className="detail-label">Curso</span>
                                    <span className="detail-value">{selectedBlock.course} ({selectedBlock.studentsCount} est.)</span>
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
