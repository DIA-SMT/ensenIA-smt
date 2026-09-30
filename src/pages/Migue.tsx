/**
 * Migue — el asistente de la escuela.
 *
 * Una sola pantalla para los cuatro roles, porque lo que cambia de verdad
 * está del lado del servidor: la audiencia se deriva del rol en la base
 * (017), no de lo que diga el cliente. Acá cambian el encuadre, las
 * sugerencias y el aviso de qué se comparte y qué no.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Send, Sparkles, RotateCcw, Scale, ShieldAlert, Loader2, Info,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  audienceForRole, getOrCreateSession, getMessages, resetSession, streamMigue,
} from '../services/migue.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { MigueAudience, MigueSession } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import '../components/Modals.css';
import './Migue.css';

interface Burbuja {
  role: 'user' | 'assistant';
  content: string;
  citadas?: { id: string; title: string }[];
  derivada?: 'seguimiento' | 'urgente' | null;
}

const ENCUADRE: Record<MigueAudience, {
  titulo: string;
  bajada: string;
  aviso: string;
  sugerencias: string[];
}> = {
  equipo: {
    titulo: 'Migue',
    bajada: 'Preguntale por la normativa y los protocolos de la escuela. Responde con lo que dirección cargó, citando la norma.',
    aviso: 'Migue responde solo con la normativa publicada de tu escuela. Si no encuentra una norma, te lo dice en vez de inventarla.',
    sugerencias: [
      '¿Qué hago si un estudiante falta hace tres semanas?',
      '¿Cómo se procede ante una pelea entre compañeros?',
      '¿Qué dice el reglamento sobre el uso del celular?',
    ],
  },
  estudiante: {
    titulo: 'Migue',
    bajada: 'Para estudiar, para entender algo que no te cierra, o para contarle cómo venís.',
    aviso: 'Migue no guarda secretos: si le contás algo que preocupa, la escuela se entera para poder darte una mano, y él te lo avisa en el momento.',
    sugerencias: [
      'Explicame la tabla periódica como si tuviera 13 años',
      'Ayudame a organizarme para la prueba del viernes',
      'No entiendo el sistema sexagesimal',
    ],
  },
  familia: {
    titulo: 'Migue',
    bajada: 'Para consultar las normas de la escuela y cómo acompañar el recorrido de tu hijo o hija.',
    aviso: 'Migue no accede a las notas ni al seguimiento: eso lo ves en "Mis hijos". Tampoco opina sobre decisiones pedagógicas.',
    sugerencias: [
      '¿Cuál es el acuerdo de convivencia de la escuela?',
      '¿Qué pasa si llega tarde varias veces?',
      '¿Cómo puedo acompañarla mejor con las tareas?',
    ],
  },
};

export default function Migue() {
  const { user } = useAuth();
  const audience = user ? audienceForRole(user.role) : null;

  const [sesion, setSesion] = useState<MigueSession | null>(null);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [enVuelo, setEnVuelo] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const finRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user || !audience) { setCargando(false); return; }
    let cancelado = false;
    (async () => {
      try {
        const s = await getOrCreateSession(audience);
        if (cancelado) return;
        setSesion(s);
        const msgs = await getMessages(s.id);
        if (cancelado) return;
        setBurbujas(msgs
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      } catch (err) {
        console.error(err);
        if (!cancelado) setError('No se pudo abrir la conversación con Migue.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; abortRef.current?.abort(); };
  }, [user, audience]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [burbujas]);

  if (!user) return null;

  if (!audience) {
    return (
      <div className="migue-container">
        <p className="text-secondary p-6">Tu rol no tiene acceso a Migue.</p>
      </div>
    );
  }

  const enc = ENCUADRE[audience];

  const enviar = async (pregunta?: string) => {
    const contenido = (pregunta ?? texto).trim();
    if (!contenido || !sesion || enVuelo) return;

    setError('');
    setTexto('');
    const historial: Burbuja[] = [...burbujas, { role: 'user', content: contenido }];
    setBurbujas([...historial, { role: 'assistant', content: '' }]);
    setEnVuelo(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    await streamMigue(
      sesion.id,
      historial.map(b => ({ role: b.role, content: b.content })),
      {
        onToken: (t) => setBurbujas(prev => {
          const copia = [...prev];
          const ult = copia[copia.length - 1];
          if (ult?.role === 'assistant') copia[copia.length - 1] = { ...ult, content: ult.content + t };
          return copia;
        }),
        onDone: (meta) => {
          if (!meta.persistido) {
            setError('Migue respondió, pero esta conversación no se pudo guardar: si recargás, no va a estar.');
          }
          setBurbujas(prev => {
            const copia = [...prev];
            const ult = copia[copia.length - 1];
            if (ult?.role === 'assistant') {
              copia[copia.length - 1] = {
                ...ult, citadas: meta.citedPolicies, derivada: meta.derivada,
              };
            }
            return copia;
          });
        },
        onError: (e) => {
          setError(e.message);
          setBurbujas(prev => {
            const copia = [...prev];
            const ult = copia[copia.length - 1];
            // Si la escuela YA fue avisada, la burbuja se queda solo para
            // llevar ese aviso: que el chat se haya caído no puede hacer
            // que el chico no se entere.
            if (ult?.content === '') {
              if (e.derivada) copia[copia.length - 1] = { ...ult, derivada: e.derivada };
              else copia.pop();
            }
            return copia;
          });
        },
      },
      ctrl.signal,
    );
    setEnVuelo(false);
  };

  const limpiar = async () => {
    if (!sesion) return;
    if (!window.confirm('Se borra esta conversación. ¿Empezamos de cero?')) return;
    try {
      await resetSession(sesion.id);
      setBurbujas([]);
      setError('');
    } catch (err) {
      console.error(err);
      setError('No se pudo borrar la conversación.');
    }
  };

  return (
    <div className="migue-container animate-in">
      <div className="migue-head">
        <div>
          <h2><Sparkles size={20} className="text-cyan" /> {enc.titulo}</h2>
          <p className="text-secondary text-sm">{enc.bajada}</p>
        </div>
        {burbujas.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={limpiar} disabled={enVuelo}>
            <RotateCcw size={14} /> Empezar de cero
          </button>
        )}
      </div>

      <div className={`migue-aviso ${audience === 'estudiante' ? 'destacado' : ''}`}>
        <Info size={14} />
        <span>{enc.aviso}</span>
      </div>

      <div className="migue-hilo">
        {cargando && <p className="text-secondary text-sm">Abriendo la conversación…</p>}

        {!cargando && burbujas.length === 0 && (
          <div className="migue-vacio">
            <Sparkles size={28} className="text-cyan" />
            <p className="text-secondary text-sm">Podés arrancar por acá:</p>
            <div className="migue-sugerencias">
              {enc.sugerencias.map(s => (
                <button key={s} className="migue-sugerencia" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {burbujas.map((b, i) => (
          <div key={i} className={`migue-burbuja ${b.role}`}>
            {b.role === 'assistant' ? (
              <>
                {b.content
                  ? <MarkdownRenderer content={b.content} />
                  : b.derivada
                    ? null
                    : <span className="migue-pensando"><Loader2 size={14} className="spin" /> Migue está pensando…</span>}

                {b.derivada && (
                  <div className={`migue-derivada ${b.derivada}`}>
                    <ShieldAlert size={14} />
                    <span>
                      {b.derivada === 'urgente'
                        ? 'Esto se le avisó a la escuela ahora mismo para que puedan acompañarte. No estás solo.'
                        : 'Esto se compartió con la escuela para que puedan darte una mano.'}
                    </span>
                  </div>
                )}

                {b.citadas && b.citadas.length > 0 && (
                  <div className="migue-citas">
                    <Scale size={12} />
                    <span>Consultó: {b.citadas.map(c => c.title).join(' · ')}</span>
                  </div>
                )}
              </>
            ) : (
              <p>{b.content}</p>
            )}
          </div>
        ))}

        {error && <div className="em-error">{error}</div>}
        <div ref={finRef} />
      </div>

      <form
        className="migue-compositor"
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
      >
        <textarea
          className="form-textarea"
          rows={2}
          placeholder={audience === 'estudiante'
            ? 'Escribile a Migue…'
            : 'Preguntale a Migue…'}
          aria-label={audience === 'estudiante' ? 'Mensaje para Migue' : 'Pregunta para Migue'}
          value={texto}
          disabled={enVuelo || cargando || !sesion}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={enVuelo || cargando || !sesion || !texto.trim()}
          aria-label={enVuelo ? 'Enviando…' : 'Enviar'}
        >
          {enVuelo ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        </button>
      </form>
    </div>
  );
}
