import { useState } from 'react';
import { Sparkles, FileText, ListChecks, FileInput, Presentation, Mic, Send, Bot, User, Settings2, SlidersHorizontal, BookOpen, Users } from 'lucide-react';
import './IALab.css';

const tools = [
    { id: 'act', label: 'Generar actividad', icon: FileText, active: true },
    { id: 'eval', label: 'Generar evaluación', icon: ListChecks, active: false },
    { id: 'sum', label: 'Resumir documento', icon: FileInput, active: false },
    { id: 'pres', label: 'Crear presentación', icon: Presentation, active: false },
    { id: 'oral', label: 'Evaluar oral', icon: Mic, active: false },
];

export default function IALab() {
    const [chatInput, setChatInput] = useState('');

    return (
        <div className="ia-lab-container">
            {/* L: Tools panel */}
            <div className="lab-sidebar card">
                <div className="lab-panel-header">
                    <Sparkles size={20} className="text-ia-accent" />
                    <h3>Herramientas IA</h3>
                </div>
                <div className="tools-list">
                    {tools.map(t => (
                        <div key={t.id} className={`tool-item ${t.active ? 'active' : ''}`}>
                            <t.icon size={18} className={t.active ? 'text-ia-accent' : 'text-secondary'} />
                            <span>{t.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* C: Main Chat / Editor */}
            <div className="lab-main card">
                <div className="lab-main-header border-bottom">
                    <div className="model-selector">
                        <span className="badge badge-ia">Edu-Model v4</span>
                        <span className="text-sm text-secondary">Optimizador rápido</span>
                    </div>
                    <button className="btn btn-outline text-sm">Limpiar chat</button>
                </div>

                <div className="lab-chat-area">
                    <div className="lab-msg bot-msg">
                        <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                        <div className="msg-content">
                            <p>Hola Marco, estoy listo para estructurar una nueva **Actividad Práctica**. Basado en tu configuración actual, generaré contenido para estudiantes de *4to Año* sobre *Biología*.</p>
                            <br />
                            <p>¿Qué tema específico abordaremos y qué formato prefieres (ej. trabajo en grupo, investigación individual, experimento breve)?</p>
                        </div>
                    </div>

                    <div className="lab-msg user-msg">
                        <div className="msg-content">
                            <p>Quiero un experimento breve sobre ósmosis usando materiales caseros, como una papa y sal. Debe durar unos 20 minutos.</p>
                        </div>
                        <div className="msg-avatar bg-primary"><User size={18} className="text-white" /></div>
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
                    </div>
                </div>
            </div>

            {/* R: Configuration */}
            <div className="lab-config card">
                <div className="lab-panel-header">
                    <Settings2 size={20} className="text-secondary" />
                    <h3>Contexto y Parámetros</h3>
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
                        <select className="form-select" defaultValue="bio">
                            <option value="bio">Biología</option>
                            <option value="fis">Física</option>
                            <option value="qui">Química</option>
                            <option value="mat">Matemática</option>
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
                            rows={4}
                        ></textarea>
                    </div>

                    <button className="btn btn-outline w-full mt-4">Guardar como preset</button>
                </div>
            </div>
        </div>
    );
}
