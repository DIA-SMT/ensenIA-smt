import { useState } from 'react';
import { ChevronRight, Plus, Folder, FileText, Sparkles, Send, GripVertical, CheckCircle, FileUp, ListChecks } from 'lucide-react';
import './Planner.css';

const units = [
    {
        id: 'u1', title: 'Unidad 1: Células', expanded: true, classes: [
            { id: 'c1', title: 'Estructura Celular', active: true },
            { id: 'c2', title: 'Mitosis y Meiosis', active: false },
        ]
    },
    {
        id: 'u2', title: 'Unidad 2: Genética', expanded: false, classes: [
            { id: 'c3', title: 'Leyes de Mendel', active: false },
            { id: 'c4', title: 'ADN y ARN', active: false },
        ]
    }
];

export default function Planner() {
    const [chatInput, setChatInput] = useState('');

    return (
        <div className="planner-container">
            {/* L: Units Structure */}
            <div className="planner-sidebar card">
                <div className="planner-sidebar-header">
                    <h3>Biología Celular - 4to 2da</h3>
                    <button className="btn-icon"><Plus size={18} /></button>
                </div>
                <div className="units-list">
                    {units.map(unit => (
                        <div key={unit.id} className="unit-group">
                            <div className="unit-header">
                                <ChevronRight size={16} className={`chevron ${unit.expanded ? 'expanded' : ''}`} />
                                <Folder size={16} className="text-secondary" />
                                <span>{unit.title}</span>
                            </div>
                            {unit.expanded && (
                                <div className="unit-classes">
                                    {unit.classes.map(cls => (
                                        <div key={cls.id} className={`unit-class-item ${cls.active ? 'active' : ''}`}>
                                            <FileText size={14} className={cls.active ? 'text-primary' : 'text-secondary'} />
                                            <span>{cls.title}</span>
                                        </div>
                                    ))}
                                    <button className="add-class-btn">
                                        <Plus size={14} /> Añadir clase
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* C: Editor */}
            <div className="planner-editor card">
                <header className="editor-header">
                    <input className="editor-title" value="Estructura Celular" readOnly />
                    <div className="editor-meta">
                        <span className="badge badge-success">Guardado hace 2 min</span>
                    </div>
                </header>

                <div className="editor-content">
                    <div className="editor-block">
                        <div className="block-drag"><GripVertical size={16} /></div>
                        <div className="block-content">
                            <h4>Objetivos de aprendizaje</h4>
                            <ul className="todo-list">
                                <li><CheckCircle size={16} className="text-success" /> Identificar organelas principales.</li>
                                <li><CheckCircle size={16} className="text-secondary" /> Comprender la función del núcleo.</li>
                            </ul>
                        </div>
                    </div>

                    <div className="editor-block">
                        <div className="block-drag"><GripVertical size={16} /></div>
                        <div className="block-content">
                            <h4>Desarrollo / Texto</h4>
                            <p className="editor-text">La célula es la unidad fundamental de la vida. Existen dos tipos principales: eucariotas y procariotas. Durante esta clase abordaremos la estructura interna de las células eucariotas...</p>
                        </div>
                    </div>

                    <div className="editor-block">
                        <div className="block-drag"><GripVertical size={16} /></div>
                        <div className="block-content border-dashed">
                            <div className="empty-state">
                                <FileUp size={24} className="text-secondary mb-2" />
                                <p>Arrastra material de apoyo aquí</p>
                                <button className="btn btn-outline text-xs mt-2">Subir archivo</button>
                            </div>
                        </div>
                    </div>

                    <div className="editor-block block-new">
                        <Plus size={20} className="text-secondary" />
                        <span className="text-secondary">Añadir bloque (Texto, Actividad, Ref...)</span>
                    </div>
                </div>
            </div>

            {/* R: IA Assistant */}
            <div className="planner-ia card bg-ia">
                <div className="ia-header border-bottom">
                    <Sparkles className="text-ia-accent" size={20} />
                    <h3>Asistente IA</h3>
                </div>

                <div className="ia-actions">
                    <button className="btn btn-ia w-full text-sm">
                        <Sparkles size={16} /> Generar actividad con IA
                    </button>
                    <button className="btn btn-outline w-full text-sm border-ia">
                        <ListChecks size={16} /> Crear evaluación
                    </button>
                    <button className="btn btn-outline w-full text-sm border-ia">
                        <FileText size={16} /> Crear resumen
                    </button>
                </div>

                <div className="ia-chat">
                    <div className="chat-messages">
                        <div className="chat-bubble ia-msg">
                            <Sparkles size={14} className="msg-icon" />
                            <p>Acabo de estructurar la clase "Estructura Celular". ¿Quieres que genere ejercicios prácticos basados en estos objetivos?</p>
                        </div>
                        <div className="chat-bubble user-msg">
                            <p>Sí, prepara 3 preguntas multiple choice nivel secundario.</p>
                        </div>
                    </div>

                    <div className="chat-input-area border-top">
                        <input
                            type="text"
                            placeholder="Pregúntale a la IA..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                        />
                        <button className="btn-send"><Send size={16} /></button>
                    </div>
                </div>
            </div>
        </div>
    );
}
