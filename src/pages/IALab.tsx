import { useState, useMemo } from 'react';
import {
    Sparkles, FileText, ListChecks, FileInput, Presentation, Mic,
    Send, Bot, User, Settings2, SlidersHorizontal, BookOpen, Users,
    ChevronRight, Plus, Folder, GripVertical, CheckCircle, FileUp,
    MessageSquare, PenLine, ChevronDown
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPlanningByTeacher, getSubjectById } from '../data';
import type { PlanningUnit, PlanningClass, SubjectAssignment } from '../types';
import './IALab.css';

/* ── Tool definitions ── */
const tools = [
    { id: 'act', label: 'Generar actividad', icon: FileText },
    { id: 'eval', label: 'Generar evaluación', icon: ListChecks },
    { id: 'sum', label: 'Resumir documento', icon: FileInput },
    { id: 'pres', label: 'Crear presentación', icon: Presentation },
    { id: 'oral', label: 'Evaluar oral', icon: Mic },
];

type CenterMode = 'chat' | 'editor';

export default function IALab() {
    const { user } = useAuth();
    const [chatInput, setChatInput] = useState('');
    const [activeTool, setActiveTool] = useState('act');
    const [centerMode, setCenterMode] = useState<CenterMode>('chat');
    const [selectedClass, setSelectedClass] = useState<PlanningClass | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

    if (!user) return null;

    /* ── Subject / Course selector ── */
    const assignments = user.subjects ?? [];
    const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState(0);
    const currentAssignment: SubjectAssignment | undefined = assignments[selectedAssignmentIdx];

    /* ── Planning data ── */
    const allUnits = getPlanningByTeacher(user.id);
    const filteredUnits = useMemo(() => {
        if (!currentAssignment) return allUnits;
        return allUnits.filter(
            u => u.subjectId === currentAssignment.subjectId && u.courseId === currentAssignment.courseId
        );
    }, [allUnits, currentAssignment]);

    /* ── Helpers ── */
    const toggleUnit = (unitId: string) => {
        setExpandedUnits(prev => {
            const next = new Set(prev);
            next.has(unitId) ? next.delete(unitId) : next.add(unitId);
            return next;
        });
    };

    const handleSelectClass = (cls: PlanningClass, unitId: string) => {
        setSelectedClass(cls);
        setSelectedUnitId(unitId);
        setCenterMode('editor');
    };

    const handleBackToChat = () => {
        setCenterMode('chat');
        setSelectedClass(null);
        setSelectedUnitId(null);
    };

    const subjectName = currentAssignment
        ? getSubjectById(currentAssignment.subjectId)?.name ?? ''
        : '';

    return (
        <div className="ia-lab-container">
            {/* ═══════════ LEFT: Planning Tree ═══════════ */}
            <div className="lab-sidebar card">
                <div className="lab-panel-header">
                    <Folder size={18} className="text-ia-accent" />
                    <h3>Planificación</h3>
                </div>

                {/* Subject/Course Selector */}
                {assignments.length > 0 && (
                    <div className="subject-selector">
                        <div className="selector-current" tabIndex={0}>
                            <select
                                className="form-select compact-select"
                                value={selectedAssignmentIdx}
                                onChange={e => setSelectedAssignmentIdx(Number(e.target.value))}
                            >
                                {assignments.map((a, i) => {
                                    const sName = getSubjectById(a.subjectId)?.name ?? a.subjectId;
                                    return (
                                        <option key={i} value={i}>
                                            {sName} — {a.courseName}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>
                )}

                {/* Units Tree */}
                <div className="units-tree">
                    {filteredUnits.length === 0 && (
                        <div className="tree-empty">
                            <p className="text-sm text-secondary">Sin unidades aún.</p>
                        </div>
                    )}
                    {filteredUnits.map(unit => {
                        const isExpanded = expandedUnits.has(unit.id);
                        return (
                            <div key={unit.id} className="unit-group">
                                <div className="unit-header" onClick={() => toggleUnit(unit.id)}>
                                    <ChevronRight size={14} className={`chevron ${isExpanded ? 'expanded' : ''}`} />
                                    <Folder size={14} className="text-secondary" />
                                    <span className="unit-title">{unit.title}</span>
                                    <span className="unit-count">{unit.classes.length}</span>
                                </div>
                                {isExpanded && (
                                    <div className="unit-classes">
                                        {unit.classes.map(cls => (
                                            <div
                                                key={cls.id}
                                                className={`unit-class-item ${
                                                    selectedClass?.id === cls.id ? 'active' : ''
                                                } ${cls.isComplete ? 'is-complete' : ''}`}
                                                onClick={() => handleSelectClass(cls, unit.id)}
                                            >
                                                {cls.isComplete
                                                    ? <CheckCircle size={13} className="text-success" />
                                                    : <FileText size={13} className="text-secondary" />
                                                }
                                                <span>{cls.title}</span>
                                            </div>
                                        ))}
                                        <button className="add-class-btn">
                                            <Plus size={13} /> Añadir clase
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="tree-actions">
                    <button className="btn btn-outline w-full text-sm">
                        <Plus size={15} /> Nueva Unidad
                    </button>
                </div>
            </div>

            {/* ═══════════ CENTER: Chat / Editor (dual mode) ═══════════ */}
            <div className="lab-main card">
                {/* Mode toggle tabs */}
                <div className="lab-main-header border-bottom">
                    <div className="mode-tabs">
                        <button
                            className={`mode-tab ${centerMode === 'chat' ? 'active' : ''}`}
                            onClick={handleBackToChat}
                        >
                            <MessageSquare size={15} />
                            <span>Chat IA</span>
                        </button>
                        <button
                            className={`mode-tab ${centerMode === 'editor' ? 'active' : ''}`}
                            onClick={() => selectedClass && setCenterMode('editor')}
                            disabled={!selectedClass}
                        >
                            <PenLine size={15} />
                            <span>Editor</span>
                        </button>
                    </div>
                    <div className="header-right">
                        <span className="badge badge-ia">Edu-Model v4</span>
                        {centerMode === 'chat' && (
                            <button className="btn btn-outline text-sm">Limpiar chat</button>
                        )}
                    </div>
                </div>

                {/* ── Chat Mode ── */}
                {centerMode === 'chat' && (
                    <>
                        <div className="lab-chat-area">
                            <div className="lab-msg bot-msg">
                                <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                                <div className="msg-content">
                                    <p>Hola {user.firstName}, estoy listo para ayudarte con <strong>{subjectName || 'tu materia'}</strong>
                                        {currentAssignment ? ` para ${currentAssignment.courseName}` : ''}.</p>
                                    <br />
                                    <p>Seleccioná una herramienta a la derecha, o describí lo que necesitás generar. También podés seleccionar una clase del árbol de planificación para editarla.</p>
                                </div>
                            </div>

                            <div className="lab-msg user-msg">
                                <div className="msg-content">
                                    <p>Quiero un experimento breve sobre ósmosis usando materiales caseros, como una papa y sal. Debe durar unos 20 minutos.</p>
                                </div>
                                <div className="msg-avatar user-avatar"><User size={18} className="text-white" /></div>
                            </div>

                            <div className="lab-msg bot-msg">
                                <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                                <div className="msg-content">
                                    <div className="generation-loader">
                                        <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                                        <span className="text-xs text-ia-accent ml-2">Generando paso a paso...</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lab-input-wrapper border-top">
                            <div className="lab-input-box">
                                <input
                                    type="text"
                                    placeholder="Describe lo que necesitas crear..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                />
                                <button className="btn-send-large"><Send size={18} /></button>
                            </div>
                            <div className="lab-input-hints">
                                <span>Sugerencias:</span>
                                <button className="hint-chip">Añadir rúbrica de evaluación</button>
                                <button className="hint-chip">Hacerlo más visual</button>
                                <button className="hint-chip">Generar cuestionario</button>
                            </div>
                        </div>
                    </>
                )}

                {/* ── Editor Mode ── */}
                {centerMode === 'editor' && selectedClass && (
                    <>
                        <div className="editor-area">
                            <header className="editor-header">
                                <input
                                    key={selectedClass.id}
                                    className="editor-title"
                                    defaultValue={selectedClass.title}
                                    placeholder="Título de la clase..."
                                />
                                <div className="editor-meta">
                                    <span className={`badge ${selectedClass.isComplete ? 'badge-success' : 'badge-warning'}`}>
                                        {selectedClass.isComplete ? 'Completa' : 'Borrador'}
                                    </span>
                                </div>
                            </header>

                            <div className="editor-content">
                                {/* Objectives Block */}
                                {selectedClass.objectives && selectedClass.objectives.length > 0 && (
                                    <div className="editor-block">
                                        <div className="block-drag"><GripVertical size={16} /></div>
                                        <div className="block-body">
                                            <h4>Objetivos de aprendizaje</h4>
                                            <ul className="objectives-list">
                                                {selectedClass.objectives.map((obj, i) => (
                                                    <li key={i}>
                                                        <CheckCircle size={15} className={i === 0 ? 'text-success' : 'text-secondary'} />
                                                        <span>{obj}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                {/* Content Block */}
                                <div className="editor-block">
                                    <div className="block-drag"><GripVertical size={16} /></div>
                                    <div className="block-body">
                                        <h4>Desarrollo / Texto</h4>
                                        {selectedClass.content ? (
                                            <p className="editor-text">{selectedClass.content}</p>
                                        ) : (
                                            <p className="editor-text placeholder-text">
                                                Hacé clic para escribir o usá el chat IA para generar contenido...
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Material Drop Zone */}
                                <div className="editor-block">
                                    <div className="block-drag"><GripVertical size={16} /></div>
                                    <div className="block-body border-dashed">
                                        <div className="drop-zone">
                                            <FileUp size={22} className="text-secondary" />
                                            <p>Arrastrá material de apoyo aquí</p>
                                            <button className="btn btn-outline text-xs">Subir archivo</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Add Block */}
                                <div className="editor-block block-new">
                                    <Plus size={18} className="text-secondary" />
                                    <span className="text-secondary">Añadir bloque (Texto, Actividad, Recurso...)</span>
                                </div>
                            </div>
                        </div>

                        {/* Bottom: quick IA input for editor */}
                        <div className="lab-input-wrapper border-top">
                            <div className="lab-input-box">
                                <input
                                    type="text"
                                    placeholder={`Pedile a la IA que complete "${selectedClass.title}"...`}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                />
                                <button className="btn-send-large"><Send size={18} /></button>
                            </div>
                            <div className="lab-input-hints">
                                <span>Sugerencias:</span>
                                <button className="hint-chip">Generar contenido completo</button>
                                <button className="hint-chip">Crear actividad práctica</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ═══════════ RIGHT: Tools + Config ═══════════ */}
            <div className="lab-config card">
                {/* Tools Section */}
                <div className="lab-panel-header">
                    <Sparkles size={18} className="text-ia-accent" />
                    <h3>Herramientas IA</h3>
                </div>
                <div className="tools-list">
                    {tools.map(t => (
                        <div
                            key={t.id}
                            className={`tool-item ${activeTool === t.id ? 'active' : ''}`}
                            onClick={() => { setActiveTool(t.id); setCenterMode('chat'); }}
                        >
                            <t.icon size={16} className={activeTool === t.id ? 'text-ia-accent' : 'text-secondary'} />
                            <span>{t.label}</span>
                        </div>
                    ))}
                </div>

                {/* Config Section */}
                <div className="config-divider"></div>
                <div className="config-section-header">
                    <Settings2 size={16} className="text-secondary" />
                    <span>Contexto y Parámetros</span>
                </div>

                <div className="config-form">
                    <div className="form-group">
                        <label><Users size={14} /> Edad / Nivel Educativo</label>
                        <select className="form-select" defaultValue="4to">
                            <option value="1ro">1er Año (13-14 años)</option>
                            <option value="2do">2do Año (14-15 años)</option>
                            <option value="3ro">3er Año (15-16 años)</option>
                            <option value="4to">4to Año (16-17 años)</option>
                            <option value="5to">5to Año (17-18 años)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label><BookOpen size={14} /> Materia</label>
                        <select className="form-select" value={currentAssignment?.subjectId ?? ''} readOnly>
                            {assignments.map((a, i) => (
                                <option key={i} value={a.subjectId}>
                                    {getSubjectById(a.subjectId)?.name ?? a.subjectId}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label><SlidersHorizontal size={14} /> Dificultad</label>
                        <div className="range-wrapper">
                            <input type="range" min="1" max="5" defaultValue="3" className="form-range" />
                            <div className="range-labels">
                                <span>Básica</span>
                                <span>Avanzada</span>
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Objetivos Pedagógicos (Opcional)</label>
                        <textarea
                            className="form-textarea"
                            placeholder="Ej: Fomentar el pensamiento crítico y el trabajo en equipo..."
                            rows={3}
                        ></textarea>
                    </div>

                    <button className="btn btn-outline w-full">Guardar como preset</button>
                </div>
            </div>
        </div>
    );
}
