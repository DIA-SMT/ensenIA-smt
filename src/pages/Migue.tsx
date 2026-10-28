/**
 * Migue — el asistente de la escuela.
 *
 * Una sola pantalla para los cuatro roles, porque lo que cambia de verdad
 * está del lado del servidor: la audiencia se deriva del rol en la base
 * (017), no de lo que diga el cliente. Acá cambian el encuadre, las
 * sugerencias y el aviso de qué se comparte y qué no.
 *
 * Para el docente, Migue es el único asistente (UX docente, 25/10): sabe qué
 * está mirando (un tema, un material, una actividad, la clase en vivo), le
 * propone botones que lo llevan a hacerlo con todo cargado, y lo que le
 * sirve de una respuesta lo guarda en el tema, como material o lo publica.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Send, Sparkles, RotateCcw, Scale, ShieldAlert, Loader2, Info, X, ArrowRight, Copy, Check, Wand2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  audienceForRole, getOrCreateSession, getMessages, resetSession, streamMigue, sinMarcas,
  type AccionMigue, type ContextoResueltoMigue,
} from '../services/migue.service';
import type { ContextoMigue } from '../contexts/MigueContext';
import { createMaterial } from '../services/library.service';
import { agregarAlTema } from '../services/planning.service';
import { getTutoresAbiertos, type TutorAbierto } from '../services/tutor.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import RefineResultModal from '../components/RefineResultModal';
import PublishActivityModal from '../components/PublishActivityModal';
import IrAlFinal from '../components/ui/IrAlFinal';
import { useSeguirAlFinal, useTextoSuave } from '../lib/useChat';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Cargando } from '../components/ui/Esqueleto';
import { confirmar } from '../components/ui/avisar';
import type { MigueAudience, MigueSession } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import '../components/Modals.css';
import './Migue.css';
import '../components/RepasoConMigue.css';

interface Burbuja {
  role: 'user' | 'assistant';
  content: string;
  citadas?: { id: string; title: string }[];
  derivada?: 'seguimiento' | 'urgente' | null;
  /** Botones que propuso Migue (solo los de esta sesión: no se guardan) */
  acciones?: AccionMigue[];
  /** Sobre qué se habló (lo que leyó el servidor): habilita "Usar esto" */
  contexto?: ContextoResueltoMigue | null;
}

const ENCUADRE: Record<MigueAudience, {
  titulo: string;
  bajada: string;
  aviso: string;
  sugerencias: string[];
}> = {
  equipo: {
    titulo: 'Migue',
    bajada: 'Tu asistente para preparar clases, pensar estrategias y usar la app. Sabe qué estás mirando y te lleva a hacerlo.',
    aviso: 'En pedagogía, Migue propone ideas para que vos decidas. Sobre la escuela y su normativa, usa solo la información disponible, cita las normas y te avisa si no encuentra un dato.',
    sugerencias: [
      'Ayudame a adaptar una actividad para distintos ritmos de aprendizaje',
      '¿Cómo puedo comprobar si entendieron sin tomar una prueba?',
      '¿Qué dice la escuela sobre el uso del celular?',
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

const corto = (t: string, max = 42) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/** Para arrancar, según lo que está mirando */
function sugerenciasDe(c: ContextoMigue): string[] {
  switch (c.tipo) {
    case 'tema': return [
      `¿Cómo arranco la clase de «${corto(c.titulo)}»?`,
      'Dame una actividad corta para ver si entendieron',
      '¿Cómo lo adapto para los que van más despacio?',
    ];
    case 'material': return [
      '¿Cómo uso este material en la clase?',
      'Armame 5 preguntas sobre esto para la clase en vivo',
      'Explicámelo en lenguaje simple para los chicos',
    ];
    case 'actividad': return [
      '¿Qué devolución les doy a los que se equivocaron?',
      'Dame una rúbrica simple para esta actividad',
      '¿Cómo la adapto para distintos ritmos?',
    ];
    case 'clase_en_vivo': return [
      'Una pregunta rápida para ver si entendieron',
      'Ideas para que participen más',
      '¿Cómo cierro la clase?',
    ];
  }
}

const ETIQUETA_TIPO: Record<ContextoMigue['tipo'], string> = {
  tema: 'el tema', material: 'el material', actividad: 'la actividad', clase_en_vivo: 'la clase en vivo',
};
// "Hablando del tema…" (con la contracción)
const HABLANDO_DE: Record<ContextoMigue['tipo'], string> = {
  tema: 'del tema', material: 'del material', actividad: 'de la actividad', clase_en_vivo: 'de la clase en vivo',
};

export default function Migue({ enPanel = false, alCerrar, pantalla, contexto = null, borradorInicial = '' }: {
  enPanel?: boolean;
  alCerrar?: () => void;
  /** Ruta desde la que se abrió el globito, para que Migue sepa dónde está la persona */
  pantalla?: string;
  /** Lo que está mirando el docente (un tema, un material…): Migue lo tiene en cuenta */
  contexto?: ContextoMigue | null;
  /** Lo que se deja escrito al abrir (desde un "Preguntale a Migue sobre esto") */
  borradorInicial?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const audience = user ? audienceForRole(user.role) : null;
  const [searchParams] = useSearchParams();
  // Repaso de un tema (079): el estudiante, en la página (no en el globito)
  const temaRepaso = audience === 'estudiante' && !enPanel ? searchParams.get('tema') : null;
  const [repaso, setRepaso] = useState<TutorAbierto | null>(null);

  const [sesion, setSesion] = useState<MigueSession | null>(null);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState(borradorInicial);
  const [enVuelo, setEnVuelo] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  // El docente puede pedir que no lo tenga en cuenta (la charla sigue igual)
  const [usarContexto, setUsarContexto] = useState(true);
  const [copiada, setCopiada] = useState<number | null>(null);
  // "Usar esto": revisar, guardar en el tema, como material o publicar
  const [usando, setUsando] = useState<{ content: string; contexto: ContextoResueltoMigue } | null>(null);
  const [publicando, setPublicando] = useState<{ content: string; title: string; contexto: ContextoResueltoMigue } | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user || !audience) { setCargando(false); return; }
    let cancelado = false;
    (async () => {
      // Al pasar del repaso al Migue de siempre (o al revés), la charla es otra
      setError('');
      setCargando(true);
      setBurbujas([]);
      try {
        let tema: TutorAbierto | null = null;
        if (temaRepaso) {
          tema = (await getTutoresAbiertos()).find(t => t.classId === temaRepaso) ?? null;
          if (!tema && !cancelado) setError('Ese repaso ya no está abierto. Podés seguir charlando con Migue acá.');
        }
        if (cancelado) return;
        setRepaso(tema);
        const s = await getOrCreateSession(audience, tema?.classId ?? null);
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
  }, [user, audience, temaRepaso]);

  // Mientras Migue escribe: texto parejo y el hilo acompaña sin tirones
  // (antes: un scrollIntoView suave por cada fragmento, que movía la página)
  const ultima = burbujas[burbujas.length - 1];
  const textoEnVivo = useTextoSuave(enVuelo && ultima?.role === 'assistant' ? ultima.content : '', enVuelo);
  const { lejos, irAlFinal } = useSeguirAlFinal(finRef, `${burbujas.length}|${textoEnVivo.length}`);

  if (!user) return null;

  if (!audience) {
    return (
      <div className="migue-container">
        <EstadoVacio
          icono={Info}
          titulo="Migue no está disponible para tu cuenta"
          texto="Tu rol no tiene acceso a Migue."
        />
      </div>
    );
  }

  const enc = ENCUADRE[audience];
  const esEquipo = audience === 'equipo';
  // Lo que está mirando lo usa el servidor solo con un docente: a la dirección no se le muestra
  const contextoActivo = user.role === 'docente' && usarContexto ? contexto : null;
  const sugerencias = repaso
    ? [`Haceme preguntas para repasar «${corto(repaso.titulo)}»`, 'No lo entendí: explicámelo de otra forma', 'Dame un ejercicio para practicar']
    : contextoActivo ? sugerenciasDe(contextoActivo) : enc.sugerencias;

  const enviar = async (pregunta?: string) => {
    const contenido = (pregunta ?? texto).trim();
    if (!contenido || !sesion || enVuelo) return;

    setError('');
    setTexto('');
    const historial: Burbuja[] = [...burbujas, { role: 'user', content: contenido }];
    setBurbujas([...historial, { role: 'assistant', content: '' }]);
    setEnVuelo(true);
    // La pregunta recién hecha se ve, y la respuesta la sigue debajo
    requestAnimationFrame(() => irAlFinal());

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
                ...ult,
                citadas: [
                  ...meta.citedPolicies,
                  ...meta.citedReferencias.map(r => ({ id: r.id, title: r.numero ? `${r.titulo} (${r.numero})` : r.titulo })),
                ],
                derivada: meta.derivada,
                acciones: meta.acciones,
                contexto: meta.contexto,
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
      { pantalla, contexto: contextoActivo },
    );
    setEnVuelo(false);
  };

  const limpiar = async () => {
    if (!sesion) return;
    const ok = await confirmar({
      titulo: '¿Empezamos de cero?',
      mensaje: 'Se borra esta conversación con Migue.',
      accion: 'Borrar y empezar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await resetSession(sesion.id);
      setBurbujas([]);
      setError('');
    } catch (err) {
      console.error(err);
      setError('No se pudo borrar la conversación.');
    }
  };

  /** Un botón de Migue: va a esa pantalla y el panel se cierra */
  const ir = (ruta: string) => {
    navigate(ruta);
    alCerrar?.();
  };

  const copiar = async (i: number, contenido: string) => {
    try {
      await navigator.clipboard.writeText(sinMarcas(contenido));
      setCopiada(i);
      window.setTimeout(() => setCopiada(c => (c === i ? null : c)), 2000);
    } catch {
      setError('No se pudo copiar. Seleccioná el texto y copialo a mano.');
    }
  };

  return (
    <div className="migue-container animate-in">
      <div className="migue-head">
        <div className="migue-identidad">
          {user.role === 'docente' || user.role === 'director'
            ? <span className="migue-avatar migue-avatar-head" aria-hidden="true"><img src="/migue-docente.jpeg" alt="" /></span>
            : <Sparkles size={20} className="text-cyan" />}
          <div>
            <h2>{enc.titulo}</h2>
            <p className="text-secondary text-sm">{enc.bajada}</p>
          </div>
        </div>
        <div className="migue-head-acciones">
          {burbujas.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={limpiar} disabled={enVuelo} title="Empezar de cero">
              <RotateCcw size={14} aria-hidden="true" /> <span className="migue-reiniciar-texto">Empezar de cero</span>
            </button>
          )}
          {enPanel && alCerrar && (
            <button type="button" className="btn-icon" onClick={alCerrar} aria-label="Cerrar Migue" data-inicial>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Repaso de un tema (079): qué ve su docente, dicho claro */}
      {repaso ? (
        <div className="migue-repaso" role="status">
          <span>
            Repasando <strong>«{repaso.titulo}»</strong> · {repaso.materia}
            <small>
              Tu docente no lee esta charla: ve un resumen de las dudas del curso, sin nombres. Si contás
              algo que preocupa, la escuela se entera para darte una mano.
            </small>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/migue')}>
            Volver al Migue de siempre
          </button>
        </div>
      ) : contextoActivo ? (
        <div className="migue-contexto" role="status">
          <span>
            Hablando {HABLANDO_DE[contextoActivo.tipo]} <strong>«{contextoActivo.titulo}»</strong>
            {contextoActivo.detalle ? <span className="text-subtle"> · {contextoActivo.detalle}</span> : null}
          </span>
          <button type="button" className="btn-icon" onClick={() => setUsarContexto(false)}
            aria-label={`Que Migue no tenga en cuenta ${ETIQUETA_TIPO[contextoActivo.tipo]}`} title="No tenerlo en cuenta">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className={`migue-aviso ${audience === 'estudiante' ? 'destacado' : ''}`}>
          <Info size={14} />
          <span>{enc.aviso}</span>
        </div>
      )}

      <div className="migue-hilo">
        {cargando && <Cargando texto="Abriendo la conversación…" />}

        {!cargando && burbujas.length === 0 && (
          <div className="migue-vacio">
            {user.role === 'docente' || user.role === 'director'
              ? <span className="migue-avatar migue-avatar-vacio" aria-hidden="true"><img src="/migue-docente.jpeg" alt="" /></span>
              : <Sparkles size={28} className="text-cyan" />}
            <p className="text-secondary text-sm">Podés arrancar por acá:</p>
            <div className="migue-sugerencias">
              {sugerencias.map(s => (
                <button key={s} className="migue-sugerencia" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {burbujas.map((b, i) => {
          const enCurso = enVuelo && i === burbujas.length - 1;
          const contenido = sinMarcas(enCurso ? textoEnVivo : b.content);
          // "Usar esto": el docente, con una materia y un curso de por medio
          const ctx = b.contexto;
          const puedeUsar = user.role === 'docente' && Boolean(ctx?.subjectId && ctx?.courseId);
          return (
          <div key={i} className={`migue-burbuja ${b.role}`}>
            {b.role === 'assistant' ? (
              <>
                {contenido
                  ? <MarkdownRenderer content={contenido} />
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

                {/* Lo que se puede hacer con la respuesta */}
                {esEquipo && !enCurso && contenido && (
                  <div className="migue-acciones">
                    {b.acciones?.map(a => (
                      <button key={a.clave + a.ruta} type="button" className="btn btn-primary btn-sm" onClick={() => ir(a.ruta)}>
                        <ArrowRight size={14} aria-hidden="true" /> {a.etiqueta}
                      </button>
                    ))}
                    {puedeUsar && ctx && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setUsando({ content: contenido, contexto: ctx })}
                        title="Revisarla y guardarla en el tema, como material o publicarla como actividad">
                        <Wand2 size={14} aria-hidden="true" /> Usar esto
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar(i, b.content)}>
                      {copiada === i ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                      {copiada === i ? 'Copiada' : 'Copiar'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p>{b.content}</p>
            )}
          </div>
          );
        })}

        {error && <div className="em-error">{error}</div>}
        <IrAlFinal visible={lejos && burbujas.length > 0} enCurso={enVuelo} alTocar={() => irAlFinal()} />
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
            : contextoActivo ? `Preguntale a Migue sobre ${ETIQUETA_TIPO[contextoActivo.tipo]}…` : 'Preguntale a Migue…'}
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

      {usando && (
        <RefineResultModal
          initialContent={usando.content}
          defaultTitle={`${usando.contexto.titulo}: lo de Migue`.slice(0, 120)}
          canInsertInClass={Boolean(usando.contexto.temaId)}
          className={usando.contexto.tipo === 'tema' ? usando.contexto.titulo : 'el tema'}
          onClose={() => setUsando(null)}
          onInsertInClass={async (content) => {
            const temaId = usando.contexto.temaId;
            if (!temaId) return;
            await agregarAlTema(temaId, content);
          }}
          onSaveAsMaterial={async (content, title) => {
            const c = usando.contexto;
            if (!c.subjectId) throw new Error('Falta la materia.');
            await createMaterial({
              title,
              description: 'Preparado con Migue',
              fileType: 'doc',
              fileName: '',
              fileSize: '—',
              subjectId: c.subjectId,
              subjectName: c.materia ?? 'Materia',
              courseId: c.courseId,
              classId: c.temaId,
              teacherId: user.id,
              schoolId: user.schoolId,
              tags: ['IA'],
              extractedText: content,
            });
          }}
          onPublish={(content, title) => {
            setPublicando({ content, title, contexto: usando.contexto });
            setUsando(null);
          }}
          onAskAdjust={(instruccion, content) => {
            setUsando(null);
            void enviar(`${instruccion}. Esto es lo que tengo:\n\n${content.slice(0, 3000)}`);
          }}
        />
      )}
      {publicando && publicando.contexto.subjectId && publicando.contexto.courseId && (
        <PublishActivityModal
          contentMd={publicando.content}
          teacherId={user.id}
          schoolId={user.schoolId}
          subjectId={publicando.contexto.subjectId}
          courseId={publicando.contexto.courseId}
          subjectName={publicando.contexto.materia ?? 'Materia'}
          courseName={publicando.contexto.curso ?? ''}
          classId={publicando.contexto.temaId}
          defaultTitle={publicando.title || `Actividad: ${publicando.contexto.titulo}`}
          onClose={() => setPublicando(null)}
          onPublished={() => setPublicando(null)}
        />
      )}
    </div>
  );
}
