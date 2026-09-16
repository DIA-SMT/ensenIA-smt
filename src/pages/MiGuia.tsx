/**
 * EstudIA — Mi guía IA (portal del estudiante)
 *
 * La IA del estudiante NO hace la tarea: tiene exactamente dos modos.
 *  - Guía de estudio: te hace preguntas de a una y te corrige con onda.
 *  - Explicámelo fácil: agarra el material de la materia y lo traduce
 *    a lenguaje simple.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GraduationCap, Wand2, Send, Square, Bot, User as UserIcon, Paperclip, X, Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSharedMaterialsForStudent } from '../services/library.service';
import {
  getOrCreateSession, getSessionsByTeacher, getSessionMessages,
  saveUserMessage, getTodayUsage,
} from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { ChatMessage, ChatSession, LibraryMaterial, IAToolType } from '../types';
import './StudentPortal.css';

type GuideMode = 'guide' | 'simplify';

const MODES: Record<GuideMode, {
  title: string; sessionTitle: string; desc: string; icon: typeof GraduationCap;
  placeholder: string; starter: string;
}> = {
  guide: {
    title: 'Guía de estudio',
    sessionTitle: 'Guía de estudio',
    desc: 'Te hago preguntas de a una para repasar. No resuelvo la tarea 😉',
    icon: GraduationCap,
    placeholder: 'Contame qué tema querés repasar...',
    starter: 'Quiero repasar para una prueba.',
  },
  simplify: {
    title: 'Explicámelo fácil',
    sessionTitle: 'Explicámelo fácil',
    desc: 'Elegí un material de tus materias y te lo explico con palabras simples.',
    icon: Wand2,
    placeholder: 'Pegá un texto que no entiendas, o elegí un material arriba...',
    starter: 'Explicame este material con palabras simples.',
  },
};

// Mientras la edge function no conozca estos modos, la instrucción
// viaja adosada al primer mensaje (invisible en la UI).
const MODE_PRIMER: Record<GuideMode, string> = {
  guide: '[Modo guía de estudio: sos la compañera de estudio de un/a estudiante de secundaria. Hacele UNA pregunta por vez sobre el tema que quiere repasar, corregí sus respuestas con cariño y seguí. NUNCA resuelvas tarea ni escribas trabajos para entregar.]\n\n',
  simplify: '[Modo lenguaje fácil: sos la ayudante de un/a estudiante de secundaria. Explicá el material o texto con frases cortas, palabras simples y un ejemplo argentino concreto. Cerrá con las 3 ideas para recordar. NUNCA resuelvas tarea para entregar.]\n\n',
};

const DAILY_QUOTA = 50;

export default function MiGuia() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [mode, setMode] = useState<GuideMode>('guide');
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [attachedDoc, setAttachedDoc] = useState<LibraryMaterial | null>(null);

  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [usesToday, setUsesToday] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const readableMaterials = useMemo(() => materials.filter(m => m.extractedText), [materials]);

  useEffect(() => {
    if (!user) return;
    getSharedMaterialsForStudent().then(setMaterials).catch(console.error);
    getTodayUsage(user.id).then(u => setUsesToday(u?.messageCount ?? 0)).catch(console.error);
  }, [user]);

  // ?doc=<id> llega desde Mi Biblioteca con "Explicámelo fácil"
  useEffect(() => {
    const docId = searchParams.get('doc');
    if (!docId || materials.length === 0) return;
    const doc = materials.find(m => m.id === docId);
    if (doc?.extractedText) {
      setAttachedDoc(doc);
      setMode('simplify');
    }
    searchParams.delete('doc');
    setSearchParams(searchParams, { replace: true });
  }, [materials, searchParams, setSearchParams]);

  // Cargar (o crear) la sesión del modo activo
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await getSessionsByTeacher(user.id);
        let s = sessions.find(x => x.title === MODES[mode].sessionTitle) ?? null;
        if (!s) {
          s = await getOrCreateSession(user.id, null, { title: MODES[mode].sessionTitle });
        }
        if (cancelled) return;
        setSession(s);
        setMessages(await getSessionMessages(s.id));
      } catch (err) {
        console.error('Error cargando sesión de guía:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!user) return null;

  const usesLeft = Math.max(0, DAILY_QUOTA - usesToday);

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || isStreaming || !session) return;
    if (usesToday >= DAILY_QUOTA) {
      alert('Llegaste al límite de usos de hoy. ¡Mañana seguimos! 💪');
      return;
    }

    setInput('');
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'user',
      content: text,
      toolUsed: mode,
      modelUsed: null,
      tokenCount: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    saveUserMessage(session.id, text, mode).catch(console.error);

    // Historia para la API: el primer mensaje lleva el primer del modo.
    const history = [...messages, userMsg].map((m, i) => ({
      role: m.role as 'user' | 'assistant',
      content: i === 0 && m.role === 'user' ? MODE_PRIMER[mode] + m.content : m.content,
    }));

    setIsStreaming(true);
    setStreamingContent('');
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';

    await streamChat(
      history,
      {
        subjectName: attachedDoc?.subjectName ?? 'Estudio',
        courseName: '',
        documentTitle: attachedDoc?.title,
        documentText: attachedDoc?.extractedText ?? undefined,
      },
      { sessionId: session.id, tool: mode as IAToolType },
      {
        onToken: t => { full += t; setStreamingContent(full); },
        onDone: () => {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            sessionId: session.id,
            role: 'assistant',
            content: full,
            toolUsed: mode,
            modelUsed: null,
            tokenCount: null,
            createdAt: new Date().toISOString(),
          }]);
          setStreamingContent('');
          setIsStreaming(false);
          setUsesToday(n => n + 1);
          abortRef.current = null;
        },
        onError: err => {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            sessionId: session.id,
            role: 'assistant',
            content: `⚠️ ${err.message}`,
            toolUsed: null,
            modelUsed: null,
            tokenCount: null,
            createdAt: new Date().toISOString(),
          }]);
          setStreamingContent('');
          setIsStreaming(false);
          abortRef.current = null;
        },
      },
      controller.signal,
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    if (streamingContent) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        sessionId: session?.id ?? '',
        role: 'assistant',
        content: streamingContent,
        toolUsed: mode,
        modelUsed: null,
        tokenCount: null,
        createdAt: new Date().toISOString(),
      }]);
    }
    setStreamingContent('');
    setIsStreaming(false);
    abortRef.current = null;
  };

  return (
    <div className="sp-container animate-in guia-container">
      <div className="guia-header">
        <h3 className="sp-section-title"><Sparkles size={17} /> Mi guía IA</h3>
        <span className="guia-quota" title="Usos de IA que te quedan hoy">✨ {usesLeft} usos hoy</span>
      </div>

      {/* Selector de modo */}
      <div className="guia-modes">
        {(Object.entries(MODES) as [GuideMode, typeof MODES[GuideMode]][]).map(([key, m]) => (
          <button
            key={key}
            className={`guia-mode-card ${mode === key ? 'active' : ''}`}
            onClick={() => setMode(key)}
          >
            <m.icon size={18} />
            <span className="guia-mode-title">{m.title}</span>
            <span className="guia-mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Material adjunto */}
      <div className="guia-doc-row">
        <Paperclip size={13} />
        <select
          className="guia-doc-select"
          value={attachedDoc?.id ?? ''}
          onChange={e => {
            const doc = readableMaterials.find(m => m.id === e.target.value);
            setAttachedDoc(doc ?? null);
          }}
        >
          <option value="">Sin material — escribí el tema vos</option>
          {readableMaterials.map(m => (
            <option key={m.id} value={m.id}>{m.subjectName}: {m.title}</option>
          ))}
        </select>
        {attachedDoc && (
          <button className="btn-icon" title="Quitar material" onClick={() => setAttachedDoc(null)}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Chat */}
      <div className="card guia-chat">
        <div className="guia-messages">
          {messages.length === 0 && !isStreaming && (
            <div className="guia-empty">
              <div className="guia-empty-icon"><Bot size={22} /></div>
              <p><strong>{MODES[mode].title}</strong></p>
              <p className="text-sm text-secondary">{MODES[mode].desc}</p>
              <button className="btn btn-primary btn-sm" onClick={() => handleSend(MODES[mode].starter)}>
                {mode === 'guide' ? '🎓 Empezar a repasar' : '🪄 Explicame el material'}
              </button>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`guia-msg ${msg.role}`}>
              <div className="guia-avatar">
                {msg.role === 'assistant' ? <Bot size={15} /> : <UserIcon size={15} />}
              </div>
              <div className="guia-bubble">
                {msg.role === 'assistant'
                  ? <MarkdownRenderer content={msg.content} />
                  : <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="guia-msg assistant">
              <div className="guia-avatar"><Bot size={15} /></div>
              <div className="guia-bubble">
                {streamingContent
                  ? <MarkdownRenderer content={streamingContent} />
                  : <span className="text-sm text-secondary">Pensando...</span>}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="guia-input-row">
          {isStreaming && (
            <button className="btn btn-outline btn-sm guia-stop" onClick={handleStop}>
              <Square size={13} /> Detener
            </button>
          )}
          <textarea
            aria-label="Mensaje para la guía"
            rows={2}
            placeholder={MODES[mode].placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={isStreaming}
          />
          <button
            className="guia-send"
            onClick={() => handleSend()}
            disabled={isStreaming || !input.trim()}
            aria-label="Enviar"
          >
            <Send size={17} />
          </button>
        </div>
        <p className="guia-hint">
          La guía no hace la tarea por vos: te ayuda a entender y repasar. 💪
        </p>
      </div>
    </div>
  );
}
