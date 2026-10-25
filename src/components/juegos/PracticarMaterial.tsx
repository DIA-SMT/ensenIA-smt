/**
 * Practicar un material: un solo lugar con todas las formas de repasarlo
 * (072). El quiz con explicaciones, los cinco juegos y las tarjetas. Antes
 * eran botones sueltos en cada material; ahora es uno.
 *
 * Los juegos salen de un banco que la IA arma una sola vez por material (el
 * primero que lo abre lo genera; los demás lo usan). Cada partida se anota
 * como un intento de práctica con su juego: suma XP y racha. Con `studentId`
 * vacío (el docente probando), no se anota nada.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, Sparkles, Trophy, WifiOff, X } from 'lucide-react';
import { generarJuegos } from '../../services/documents.service';
import { recordPracticeAttemptResilient } from '../../services/offline-queue.service';
import { getStudentBadges } from '../../services/practice.service';
import { JUEGOS, juegoDisponible, type BancoJuegos, type ModoJuego } from '../../lib/juegosRepaso';
import { BADGE_META, type BadgeCode, type LibraryMaterial } from '../../types';
import JuegoUnir from './JuegoUnir';
import JuegoOrdenar from './JuegoOrdenar';
import JuegoClasificar from './JuegoClasificar';
import JuegoCompletar from './JuegoCompletar';
import JuegoContrarreloj from './JuegoContrarreloj';
import type { FinPartida } from './tipos';
import './Juegos.css';

interface Props {
  material: LibraryMaterial;
  /** El estudiante que juega; sin esto (el docente probando) no se anota nada */
  studentId?: string | null;
  onClose: () => void;
  /** El quiz con explicaciones (lo abre la pantalla, como siempre) */
  onQuiz?: () => void;
  /** Las tarjetas de repaso, si el material las tiene */
  onTarjetas?: () => void;
}

/** Los bancos ya traídos en esta sesión: cerrar y volver a abrir no pide de nuevo */
const bancosTraidos = new Map<string, BancoJuegos>();

interface Resultado extends FinPartida {
  xp: number | null;
  /** Sin señal: quedó para mandarse después */
  enCola: boolean;
  logros: string[];
}

export default function PracticarMaterial({ material, studentId, onClose, onQuiz, onTarjetas }: Props) {
  const [banco, setBanco] = useState<BancoJuegos | null>(() => bancosTraidos.get(material.id) ?? null);
  const [cargando, setCargando] = useState<ModoJuego | null>(null);
  const [error, setError] = useState('');
  const [jugando, setJugando] = useState<ModoJuego | null>(null);
  // Para empezar de nuevo el mismo juego (rearma la ronda)
  const [partida, setPartida] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [guardando, setGuardando] = useState(false);

  const abrir = async (modo: ModoJuego) => {
    setError('');
    if (banco) {
      if (!juegoDisponible(banco, modo)) return;
      setJugando(modo);
      setPartida(p => p + 1);
      return;
    }
    setCargando(modo);
    try {
      const r = await generarJuegos(material.id);
      if (!r.banco) throw new Error('No salieron juegos con este material.');
      bancosTraidos.set(material.id, r.banco);
      setBanco(r.banco);
      if (juegoDisponible(r.banco, modo)) { setJugando(modo); setPartida(p => p + 1); }
      else setError('Este material no da para ese juego: probá con otro.');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudieron armar los juegos. Probá de nuevo.');
    } finally {
      setCargando(null);
    }
  };

  const alTerminar = async (fin: FinPartida) => {
    const modo = jugando;
    setResultado({ ...fin, xp: null, enCola: false, logros: [] });
    if (!studentId || !modo || fin.total === 0) return;
    setGuardando(true);
    try {
      let antes: string[] = [];
      try { antes = (await getStudentBadges(studentId)).map(b => b.code); } catch { /* sin señal: sin logros nuevos */ }
      const guardado = await recordPracticeAttemptResilient({ studentId, materialId: material.id, score: fin.score, total: fin.total, modo });
      let logros: string[] = [];
      if (guardado) {
        try { logros = (await getStudentBadges(studentId)).map(b => b.code).filter(c => !antes.includes(c)); } catch { /* sin diff */ }
      }
      setResultado(r => r && { ...r, xp: guardado?.xpEarned ?? null, enCola: guardado === null, logros });
    } catch (err) {
      console.error('No se pudo anotar la partida:', err);
    } finally {
      setGuardando(false);
    }
  };

  const volverAlMenu = () => { setJugando(null); setResultado(null); };
  const otraVez = () => { setResultado(null); setPartida(p => p + 1); };

  const meta = jugando ? JUEGOS.find(j => j.modo === jugando) : null;

  const juego = () => {
    if (!banco || !jugando) return null;
    const props = { alTerminar: (f: FinPartida) => void alTerminar(f) };
    switch (jugando) {
      case 'unir': return <JuegoUnir key={partida} pares={banco.pares} {...props} />;
      case 'ordenar': return <JuegoOrdenar key={partida} secuencias={banco.secuencias} {...props} />;
      case 'clasificar': return <JuegoClasificar key={partida} clasificaciones={banco.clasificaciones} {...props} />;
      case 'completar': return <JuegoCompletar key={partida} frases={banco.completar} {...props} />;
      case 'contrarreloj': return <JuegoContrarreloj key={partida} afirmaciones={banco.verdadero_falso} {...props} />;
    }
  };

  // En un portal al body: la pantalla de atrás tiene un transform (animate-in) y
  // con un ancestro así position: fixed queda corrido y la barra de abajo lo tapa
  return createPortal(
    <div className="jr-overlay" role="dialog" aria-modal="true" aria-labelledby="jr-titulo">
      <div className="jr-panel animate-scale">
        <div className="jr-cabecera">
          {jugando && (
            <button type="button" className="btn-icon" onClick={volverAlMenu} aria-label="Volver a los juegos"><ArrowLeft size={18} /></button>
          )}
          <h2 id="jr-titulo">
            {meta ? `${meta.emoji} ${meta.nombre}` : 'Practicar'}
            <small>{material.title}</small>
          </h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* ── Final de una partida ── */}
        {resultado ? (
          <div className="jr-cuerpo jr-final">
            {(() => {
              const pct = resultado.total ? resultado.score / resultado.total : 0;
              return (
                <>
                  <span className="jr-final-emoji" aria-hidden="true">{resultado.total === 0 ? '⏱️' : pct === 1 ? '🎉' : pct >= 0.6 ? '💪' : '📚'}</span>
                  <h3>{resultado.total === 0 ? 'Se acabó el tiempo' : pct === 1 ? '¡Impecable!' : pct >= 0.6 ? '¡Muy bien!' : '¡Buen intento!'}</h3>
                  {resultado.total > 0 && <span className="jr-final-puntaje">{resultado.score} de {resultado.total}</span>}
                </>
              );
            })()}
            {guardando && <span className="jr-ayuda"><Loader2 size={14} className="spin" /> Anotando…</span>}
            {resultado.xp !== null && <span className="jr-xp"><Sparkles size={16} aria-hidden="true" /> +{resultado.xp} XP</span>}
            {resultado.enCola && <span className="jr-ayuda"><WifiOff size={14} aria-hidden="true" /> Sin señal: se anota cuando vuelva.</span>}
            {resultado.logros.length > 0 && (
              <p className="jr-ayuda">
                <Trophy size={14} aria-hidden="true" /> ¡Nuevo logro! {resultado.logros.map(c => (c.startsWith('crack:') ? 'Medalla de materia' : BADGE_META[c as BadgeCode]?.label ?? c)).join(', ')}
              </p>
            )}
            {resultado.repaso.length > 0 && (
              <>
                <p className="jr-ayuda">Para repasar:</p>
                <ul className="jr-repaso">
                  {resultado.repaso.map((r, k) => <li key={k}><strong>{r.pregunta}</strong>{r.respuesta}</li>)}
                </ul>
              </>
            )}
            <div className="jr-acciones">
              <button type="button" className="btn btn-primary btn-sm" onClick={otraVez}>Otra vez</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={volverAlMenu}>Otro juego</button>
            </div>
          </div>
        ) : jugando ? (
          juego()
        ) : (
          /* ── El menú: todas las formas de practicar este material ── */
          <div className="jr-cuerpo">
            <p className="jr-ayuda">Elegí cómo practicar. Todo suma a tu experiencia{studentId ? '' : ' (probando como docente: no se anota)'}.</p>
            <div className="jr-menu">
              {onQuiz && (
                <button type="button" className="jr-opcion ancha" onClick={onQuiz}>
                  <span className="jr-opcion-emoji" aria-hidden="true">🧠</span>
                  <span><strong>Preguntas con explicación</strong><br /><small>Un quiz con pistas, y por qué cada respuesta</small></span>
                </button>
              )}
              {JUEGOS.map(j => {
                const sinContenido = banco !== null && !juegoDisponible(banco, j.modo);
                return (
                  <button key={j.modo} type="button" className="jr-opcion" onClick={() => void abrir(j.modo)} disabled={cargando !== null || sinContenido}>
                    <span className="jr-opcion-emoji" aria-hidden="true">{cargando === j.modo ? <Loader2 size={22} className="spin" /> : j.emoji}</span>
                    <strong>{j.nombre}</strong>
                    <small>{sinContenido ? 'Este material no da para este juego' : cargando === j.modo ? 'Preparando los juegos…' : j.desc}</small>
                  </button>
                );
              })}
              {onTarjetas && (
                <button type="button" className="jr-opcion ancha" onClick={onTarjetas}>
                  <span className="jr-opcion-emoji" aria-hidden="true">🃏</span>
                  <span><strong>Tarjetas de repaso</strong><br /><small>Las ideas clave, para dar vuelta</small></span>
                </button>
              )}
            </div>
            {cargando && <p className="jr-ayuda" role="status">La primera vez tarda un poco: después quedan listos para todo el curso.</p>}
            {error && <p className="jr-aviso mal" role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
