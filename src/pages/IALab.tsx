import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Sparkles, FileText, ListChecks, FileInput, Presentation, Mic,
    Send, Bot, User, Settings2, SlidersHorizontal, BookOpen, Users,
    ChevronRight, Plus, Folder, GripVertical, CheckCircle, FileUp,
    MessageSquare, PenLine, Copy, Trash2, Square, ArrowDownToLine
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPlanningByTeacher, updateClass } from '../services/planning.service';
import { getSubjects } from '../services/subjects.service';
import {
    getOrCreateSession, getSessionMessages, saveUserMessage,
    getTodayUsage, clearSession
} from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type {
    PlanningUnit, PlanningClass, SubjectAssignment, Subject,
    ChatSession, ChatMessage, IAUsage, IAToolType, IAChatContext
} from '../types';
import './IALab.css';

/* -- Tool definitions -- */
const tools = [
    { id: 'act' as IAToolType, label: 'Generar actividad', icon: FileText },
    { id: 'eval' as IAToolType, label: 'Generar evaluación', icon: ListChecks },
    { id: 'sum' as IAToolType, label: 'Resumir documento', icon: FileInput },
    { id: 'pres' as IAToolType, label: 'Crear presentación', icon: Presentation },
    { id: 'oral' as IAToolType, label: 'Evaluar oral', icon: Mic },
];

const DAILY_QUOTA = 50;
const SUMMARY_INPUT_LIMIT = 8000;

type CenterMode = 'chat' | 'editor';

/* -- Tool-specific suggestion chips -- */
function getSuggestions(tool: IAToolType, classTitle?: string): string[] {
    switch (tool) {
        case 'act':
            return [
                'Actividad grupal colaborativa',
                'Experimento práctico con materiales caseros',
                'Actividad de investigación guiada',
            ];
        case 'eval':
            return [
                'Evaluación con rúbrica',
                'Cuestionario de opción múltiple',
                'Evaluación integradora',
            ];
        case 'sum':
            return [
                'Resumen con conceptos clave',
                'Resumen visual con glosario',
            ];
        case 'pres':
            return [
                'Presentación de 10 diapositivas',
                'Presentación interactiva con preguntas',
            ];
        case 'oral':
            return [
                'Rúbrica de exposición oral',
                'Rúbrica de debate grupal',
                'Guía para evaluar presentaciones',
            ];
        default:
            return classTitle
                ? [`Generar contenido para "${classTitle}"`, 'Crear actividad práctica', 'Ayudame a planificar']
                : ['Ayudame a planificar una clase', 'Generar una actividad', 'Ideas para evaluar'];
    }
}

/* -- Tool-specific pre-fill prompts -- */
function getToolPrompt(toolId: IAToolType, classTitle?: string): string {
    const ctx = classTitle ? ` para la clase "${classTitle}"` : '';
    switch (toolId) {
        case 'act': return `Generá una actividad didáctica${ctx}. Incluií objetivos, materiales, duración y desarrollo paso a paso.`;
        case 'eval': return `Creá una evaluación${ctx}. Incluií consignas variadas, rúbrica y criterios de calificación.`;
        case 'sum': return `Resumí el siguiente texto de forma clara y estructurada:\n\n[Pegá tu texto acá]`;
        case 'pres': return `Creá una presentación en diapositivas${ctx}. Máximo 10-12 slides con notas para el docente.`;
        case 'oral': return `Diseñá una rúbrica para evaluar la exposición oral${ctx}. Incluií dimensiones, escala y preguntas disparadoras.`;
        default: return '';
    }
}

export default function IALab() {
    const { user } = useAuth();

    // ── Planning state ──
    const [allUnits, setAllUnits] = useState<PlanningUnit[]>([]);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
    const [selectedClass, setSelectedClass] = useState<PlanningClass | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

    // ── Chat state ──
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [todayUsage, setTodayUsage] = useState<IAUsage | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // ── UI state ──
    const [activeTool, setActiveTool] = useState<IAToolType>('free');
    const [centerMode, setCenterMode] = useState<CenterMode>('chat');
    const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

    // ── Config state ──
    const [educationLevel, setEducationLevel] = useState('4to');
    const [difficulty, setDifficulty] = useState(3);

    // ── Subject selector (must be before any conditional return — React hooks rule) ──
    const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState(0);

    if (!user) return null;

    /* -- Subject / Course selector -- */
    const assignments = user.subjects ?? [];
    const currentAssignment: SubjectAssignment | undefined = assignments[selectedAssignmentIdx];

    // ── Load planning data + usage + subjects ──
    useEffect(() => {
        if (!user) return;
        getPlanningByTeacher(user.id).then(setAllUnits).catch(console.error);
        getTodayUsage(user.id).then(setTodayUsage).catch(console.error);

        getSubjects().then(subjects => {
            const map: Record<string, Subject> = {};
            subjects.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, [user]);

    // ── Cleanup AbortController on unmount ──
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    // ── Auto-scroll on new messages / streaming ──
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    /* -- Planning data -- */
    const filteredUnits = useMemo(() => {
        if (!currentAssignment) return allUnits;
        return allUnits.filter(
            u => u.subjectId === currentAssignment.subjectId && u.courseId === currentAssignment.courseId
        );
    }, [allUnits, currentAssignment]);

    /* -- Helpers -- */
    const subjectsLoaded = Object.keys(subjectsMap).length > 0;
    const getSubjectName = (subjectId: string) => subjectsMap[subjectId]?.name ?? (subjectsLoaded ? '' : 'Cargando...');
    const subjectName = currentAssignment ? getSubjectName(currentAssignment.subjectId) : '';

    const currentModelLabel = activeTool === 'sum' ? 'Haiku' : 'Sonnet';
    const usageCount = todayUsage?.messageCount ?? 0;

    const toggleUnit = (unitId: string) => {
        setExpandedUnits(prev => {
            const next = new Set(prev);
            next.has(unitId) ? next.delete(unitId) : next.add(unitId);
            return next;
        });
    };

    // ── Build context for API ──
    const buildContext = useCallback((): IAChatContext => {
        const unit = selectedUnitId ? allUnits.find(u => u.id === selectedUnitId) : undefined;
        return {
            subjectName: currentAssignment ? getSubjectName(currentAssignment.subjectId) : '',
            courseName: currentAssignment?.courseName ?? '',
            unitTitle: unit?.title,
            classTitle: selectedClass?.title,
            classObjectives: selectedClass?.objectives,
            classContent: selectedClass?.content ?? undefined,
            difficulty,
            educationLevel,
        };
    }, [currentAssignment, selectedClass, selectedUnitId, allUnits, difficulty, educationLevel, subjectsMap]);

    // ── Select class → load/create session ──
    const handleSelectClass = async (cls: PlanningClass, unitId: string) => {
        setSelectedClass(cls);
        setSelectedUnitId(unitId);
        setCenterMode('editor');

        try {
            const session = await getOrCreateSession(user.id, cls.id, {
                subjectId: currentAssignment?.subjectId,
                courseId: currentAssignment?.courseId,
                title: cls.title,
            });
            setCurrentSession(session);
            const msgs = await getSessionMessages(session.id);
            setMessages(msgs);
        } catch (err) {
            console.error('Error loading session:', err);
        }
    };

    // ── Switch to chat mode (create free session if needed) ──
    const handleSwitchToChat = async () => {
        setCenterMode('chat');

        if (!currentSession) {
            try {
                const session = await getOrCreateSession(user.id, selectedClass?.id ?? null, {
                    subjectId: currentAssignment?.subjectId,
                    courseId: currentAssignment?.courseId,
                    title: selectedClass?.title ?? 'Chat libre',
                });
                setCurrentSession(session);
                const msgs = await getSessionMessages(session.id);
                setMessages(msgs);
            } catch (err) {
                console.error('Error creating session:', err);
            }
        }
    };

    // ── Tool click → pre-fill prompt ──
    const handleToolClick = (toolId: IAToolType) => {
        setActiveTool(toolId);
        setCenterMode('chat');
        if (toolId !== 'free') {
            setChatInput(getToolPrompt(toolId, selectedClass?.title));
        }

        // Ensure session exists
        if (!currentSession) {
            getOrCreateSession(user.id, selectedClass?.id ?? null, {
                subjectId: currentAssignment?.subjectId,
                courseId: currentAssignment?.courseId,
                title: selectedClass?.title ?? 'Chat libre',
            }).then(session => {
                setCurrentSession(session);
                getSessionMessages(session.id).then(setMessages);
            }).catch(console.error);
        }
    };

    // ── Send message ──
    const handleSend = async () => {
        const text = chatInput.trim();
        if (!text || isStreaming) return;

        // Validate summary input length
        if (activeTool === 'sum' && text.length > SUMMARY_INPUT_LIMIT) {
            alert(`El texto para resumir es demasiado largo (máx. ${SUMMARY_INPUT_LIMIT} caracteres). Intentá con un fragmento más corto.`);
            return;
        }

        // Quota check
        if (usageCount >= DAILY_QUOTA) {
            alert(`Alcanzaste el límite de ${DAILY_QUOTA} mensajes por hoy. ¡Volvé mañana!`);
            return;
        }

        // Ensure session
        let session = currentSession;
        if (!session) {
            try {
                session = await getOrCreateSession(user.id, selectedClass?.id ?? null, {
                    subjectId: currentAssignment?.subjectId,
                    courseId: currentAssignment?.courseId,
                    title: selectedClass?.title ?? 'Chat libre',
                });
                setCurrentSession(session);
            } catch {
                return;
            }
        }

        // Save user message locally
        setChatInput('');
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sessionId: session.id,
            role: 'user',
            content: text,
            toolUsed: activeTool !== 'free' ? activeTool : null,
            modelUsed: null,
            tokenCount: null,
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMsg]);

        // Save to DB
        saveUserMessage(session.id, text, activeTool !== 'free' ? activeTool : undefined).catch(console.error);

        // Prepare conversation history for API
        const history = [...messages, userMsg].map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }));

        // Start streaming
        setIsStreaming(true);
        setStreamingContent('');
        const controller = new AbortController();
        abortControllerRef.current = controller;

        let fullContent = '';

        await streamChat(
            history,
            buildContext(),
            {
                sessionId: session.id,
                tool: activeTool,
            },
            {
                onToken: (text) => {
                    fullContent += text;
                    setStreamingContent(fullContent);
                },
                onDone: (metadata) => {
                    // Add assistant message to local state
                    const assistantMsg: ChatMessage = {
                        id: metadata.messageId || crypto.randomUUID(),
                        sessionId: session!.id,
                        role: 'assistant',
                        content: fullContent,
                        toolUsed: activeTool !== 'free' ? activeTool : null,
                        modelUsed: activeTool === 'sum' ? 'haiku' : 'sonnet',
                        tokenCount: metadata.tokensOut,
                        createdAt: new Date().toISOString(),
                    };
                    setMessages(prev => [...prev, assistantMsg]);
                    setStreamingContent('');
                    setIsStreaming(false);
                    abortControllerRef.current = null;

                    // Update usage count
                    setTodayUsage(prev => prev
                        ? { ...prev, messageCount: prev.messageCount + 1 }
                        : {
                            id: '',
                            teacherId: user.id,
                            usageDate: new Date().toISOString().split('T')[0],
                            messageCount: 1,
                            tokenCountIn: metadata.tokensIn,
                            tokenCountOut: metadata.tokensOut,
                        });
                },
                onError: (error) => {
                    console.error('Stream error:', error);
                    // Show error as a system message
                    const errorMsg: ChatMessage = {
                        id: crypto.randomUUID(),
                        sessionId: session!.id,
                        role: 'assistant',
                        content: `⚠️ ${error.message}`,
                        toolUsed: null,
                        modelUsed: null,
                        tokenCount: null,
                        createdAt: new Date().toISOString(),
                    };
                    setMessages(prev => [...prev, errorMsg]);
                    setStreamingContent('');
                    setIsStreaming(false);
                    abortControllerRef.current = null;
                },
            },
            controller.signal,
        );
    };

    // ── Stop streaming ──
    const handleStop = () => {
        abortControllerRef.current?.abort();
        if (streamingContent) {
            const partialMsg: ChatMessage = {
                id: crypto.randomUUID(),
                sessionId: currentSession?.id ?? '',
                role: 'assistant',
                content: streamingContent + '\n\n*[Generación interrumpida]*',
                toolUsed: null,
                modelUsed: null,
                tokenCount: null,
                createdAt: new Date().toISOString(),
            };
            setMessages(prev => [...prev, partialMsg]);
        }
        setStreamingContent('');
        setIsStreaming(false);
        abortControllerRef.current = null;
    };

    // ── Clear chat ──
    const handleClearChat = async () => {
        if (!currentSession) return;
        try {
            await clearSession(currentSession.id);
            setMessages([]);
        } catch (err) {
            console.error('Error clearing session:', err);
        }
    };

    // ── Copy message ──
    const handleCopyMessage = (msg: ChatMessage) => {
        navigator.clipboard.writeText(msg.content).then(() => {
            setCopiedMsgId(msg.id);
            setTimeout(() => setCopiedMsgId(null), 2000);
        });
    };

    // ── Insert from chat into editor ──
    const handleInsertFromChat = async (msg: ChatMessage) => {
        if (!selectedClass) return;
        const newContent = selectedClass.content
            ? selectedClass.content + '\n\n' + msg.content
            : msg.content;
        try {
            await updateClass(selectedClass.id, { content: newContent });
            // Update local state
            setSelectedClass({ ...selectedClass, content: newContent });
            // Refresh planning
            const units = await getPlanningByTeacher(user.id);
            setAllUnits(units);
        } catch (err) {
            console.error('Error inserting content:', err);
        }
    };

    // ── Enter key handler ──
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Suggestion chip click ──
    const handleSuggestionClick = (text: string) => {
        setChatInput(text);
    };

    const suggestions = getSuggestions(activeTool, selectedClass?.title);

    return (
        <div className="ia-lab-container">
            {/* LEFT: Planning Tree */}
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
                                onChange={e => {
                                    setSelectedAssignmentIdx(Number(e.target.value));
                                    setSelectedClass(null);
                                    setSelectedUnitId(null);
                                    setCurrentSession(null);
                                    setMessages([]);
                                }}
                            >
                                {assignments.map((a, i) => (
                                    <option key={i} value={i}>
                                        {getSubjectName(a.subjectId) || 'Materia'} — {a.courseName}
                                    </option>
                                ))}
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

            {/* CENTER: Chat / Editor (dual mode) */}
            <div className="lab-main card">
                {/* Mode toggle tabs */}
                <div className="lab-main-header border-bottom">
                    <div className="mode-tabs">
                        <button
                            className={`mode-tab ${centerMode === 'chat' ? 'active' : ''}`}
                            onClick={handleSwitchToChat}
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
                        <span className="badge badge-ia model-badge">{currentModelLabel}</span>
                        <span className="quota-badge" title="Mensajes usados hoy">
                            {usageCount}/{DAILY_QUOTA}
                        </span>
                        {centerMode === 'chat' && messages.length > 0 && (
                            <button className="btn btn-outline text-sm" onClick={handleClearChat}>
                                <Trash2 size={13} />
                                Limpiar
                            </button>
                        )}
                    </div>
                </div>

                {/* Chat Mode */}
                {centerMode === 'chat' && (
                    <>
                        <div className="lab-chat-area">
                            {/* Welcome message (when no messages) */}
                            {messages.length === 0 && !isStreaming && (
                                <div className="lab-msg bot-msg">
                                    <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                                    <div className="msg-content">
                                        <p>¡Hola {user.firstName}! Soy tu asistente pedagógico para <strong>{subjectName || 'tu materia'}</strong>
                                            {currentAssignment ? ` en ${currentAssignment.courseName}` : ''}.</p>
                                        <br />
                                        <p>Seleccioná una herramienta a la derecha, o describí lo que necesitás. También podés elegir una clase del árbol para trabajar con contexto.</p>
                                    </div>
                                </div>
                            )}

                            {/* Message history */}
                            {messages.map(msg => (
                                <div key={msg.id} className={`lab-msg ${msg.role === 'user' ? 'user-msg' : 'bot-msg'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                                    )}
                                    <div className="msg-content">
                                        {msg.role === 'assistant' ? (
                                            <>
                                                {msg.toolUsed && msg.toolUsed !== 'free' && (
                                                    <span className="msg-tool-badge">
                                                        {tools.find(t => t.id === msg.toolUsed)?.label ?? msg.toolUsed}
                                                    </span>
                                                )}
                                                <MarkdownRenderer content={msg.content} />
                                                <div className="msg-actions">
                                                    <button
                                                        className="msg-action-btn"
                                                        onClick={() => handleCopyMessage(msg)}
                                                        title="Copiar"
                                                    >
                                                        {copiedMsgId === msg.id
                                                            ? <><CheckCircle size={13} /> Copiado</>
                                                            : <><Copy size={13} /> Copiar</>
                                                        }
                                                    </button>
                                                    {selectedClass && (
                                                        <button
                                                            className="msg-action-btn btn-insert-chat"
                                                            onClick={() => handleInsertFromChat(msg)}
                                                            title="Insertar en editor"
                                                        >
                                                            <ArrowDownToLine size={13} /> Insertar en clase
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                                        )}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="msg-avatar user-avatar"><User size={18} className="text-white" /></div>
                                    )}
                                </div>
                            ))}

                            {/* Streaming indicator */}
                            {isStreaming && (
                                <div className="lab-msg bot-msg">
                                    <div className="msg-avatar bg-ia-gradient"><Bot size={18} className="text-white" /></div>
                                    <div className="msg-content">
                                        {streamingContent ? (
                                            <MarkdownRenderer content={streamingContent} />
                                        ) : (
                                            <div className="generation-loader">
                                                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                                                <span className="text-xs text-ia-accent ml-2">Generando...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div ref={chatEndRef} />
                        </div>

                        <div className="lab-input-wrapper border-top">
                            {isStreaming && (
                                <button className="btn-stop" onClick={handleStop}>
                                    <Square size={14} /> Detener generación
                                </button>
                            )}
                            <div className="lab-input-box">
                                <textarea
                                    aria-label="Mensaje para la IA"
                                    placeholder={activeTool !== 'free'
                                        ? `Describí lo que necesitás para ${tools.find(t => t.id === activeTool)?.label.toLowerCase()}...`
                                        : 'Describí lo que necesitás crear...'
                                    }
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={chatInput.split('\n').length > 3 ? 5 : 2}
                                    disabled={isStreaming}
                                />
                                <button
                                    className="btn-send-large"
                                    onClick={handleSend}
                                    disabled={isStreaming || !chatInput.trim()}
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                            {activeTool === 'sum' && (
                                <div className="sum-limit-hint">
                                    <FileInput size={12} />
                                    Límite: {SUMMARY_INPUT_LIMIT.toLocaleString()} caracteres
                                    {chatInput.length > 0 && (
                                        <span className={chatInput.length > SUMMARY_INPUT_LIMIT ? 'text-danger' : ''}>
                                            {' '}({chatInput.length.toLocaleString()})
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="lab-input-hints">
                                <span>Sugerencias:</span>
                                {suggestions.map((s, i) => (
                                    <button key={i} className="hint-chip" onClick={() => handleSuggestionClick(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Editor Mode */}
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
                                            <div className="editor-text">
                                                <MarkdownRenderer content={selectedClass.content} />
                                            </div>
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
                                <textarea
                                    aria-label="Mensaje rápido para la IA"
                                    placeholder={`Pedile a la IA que complete "${selectedClass.title}"...`}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    disabled={isStreaming}
                                />
                                <button
                                    className="btn-send-large"
                                    onClick={() => { setCenterMode('chat'); handleSend(); }}
                                    disabled={isStreaming || !chatInput.trim()}
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                            <div className="lab-input-hints">
                                <span>Sugerencias:</span>
                                <button className="hint-chip" onClick={() => handleSuggestionClick('Generar contenido completo')}>Generar contenido completo</button>
                                <button className="hint-chip" onClick={() => handleSuggestionClick('Crear actividad práctica')}>Crear actividad práctica</button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* RIGHT: Tools + Config */}
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
                            onClick={() => handleToolClick(t.id)}
                        >
                            <t.icon size={16} className={activeTool === t.id ? 'text-ia-accent' : 'text-secondary'} />
                            <span>{t.label}</span>
                            {t.id === 'sum' && <span className="tool-model-tag">Haiku</span>}
                        </div>
                    ))}
                    {/* Free chat option */}
                    <div
                        className={`tool-item ${activeTool === 'free' ? 'active' : ''}`}
                        onClick={() => handleToolClick('free')}
                    >
                        <MessageSquare size={16} className={activeTool === 'free' ? 'text-ia-accent' : 'text-secondary'} />
                        <span>Chat libre</span>
                    </div>
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
                        <select
                            className="form-select"
                            value={educationLevel}
                            onChange={e => setEducationLevel(e.target.value)}
                        >
                            <option value="1ro">1er Año (13-14 años)</option>
                            <option value="2do">2do Año (14-15 años)</option>
                            <option value="3ro">3er Año (15-16 años)</option>
                            <option value="4to">4to Año (16-17 años)</option>
                            <option value="5to">5to Año (17-18 años)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label><BookOpen size={14} /> Materia</label>
                        <select className="form-select" value={currentAssignment?.subjectId ?? ''} disabled>
                            {assignments.map((a, i) => (
                                <option key={i} value={a.subjectId}>
                                    {getSubjectName(a.subjectId) || 'Materia'}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label><SlidersHorizontal size={14} /> Dificultad</label>
                        <div className="range-wrapper">
                            <input
                                type="range"
                                min="1"
                                max="5"
                                value={difficulty}
                                onChange={e => setDifficulty(Number(e.target.value))}
                                className="form-range"
                            />
                            <div className="range-labels">
                                <span>Básica</span>
                                <span>Avanzada</span>
                            </div>
                        </div>
                    </div>

                    {selectedClass && (
                        <div className="config-context-info">
                            <h5>Clase seleccionada</h5>
                            <p className="text-sm text-secondary">{selectedClass.title}</p>
                            {selectedClass.objectives && selectedClass.objectives.length > 0 && (
                                <p className="text-xs text-subtle">{selectedClass.objectives.length} objetivo(s)</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
