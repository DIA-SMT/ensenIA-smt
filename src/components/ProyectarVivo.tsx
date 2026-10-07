/**
 * SMT EstudIA — Modo proyección de la clase en vivo
 *
 * La misma información que ve el docente en su pantalla, pero pensada
 * para leerse desde el fondo de una sala: sin sidebar, sin botones, con
 * todo dimensionado en unidades de viewport para que escale igual en un
 * proyector viejo de 1024×768 que en un televisor 4K.
 *
 * No tiene poll propio a propósito: recibe lo que ya está polleando el
 * panel del docente. Si tuviera el suyo, la pantalla proyectada y la del
 * docente mostrarían números distintos durante unos segundos, que es
 * justo lo que no podés permitirte con una sala mirando.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { LIVE_KIND_META, type LiveSession, type LiveActivity, type LiveResults } from '../services/live.service';
import { FEELING_META, type CheckinFeeling } from '../types';
import { enlacePublico } from '../lib/direccion';
import './ProyectarVivo.css';

interface Props {
    session: LiveSession;
    activity: LiveActivity | null;
    results: LiveResults | null;
    connected: number;
    /** Los emojis del último minuto (los mismos que ve el panel). */
    reactions: { emoji: string; createdAt: string }[];
    onClose: () => void;
}

export default function ProyectarVivo({ session, activity, results, connected, reactions, onClose }: Props) {
    const [qr, setQr] = useState('');
    const shellRef = useRef<HTMLDivElement>(null);

    const joinUrl = session.joinCode ? enlacePublico(`/vivo/${session.joinCode}`) : '';

    useEffect(() => {
        if (!joinUrl) return;
        QRCode.toDataURL(joinUrl, {
            width: 900,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0F1419', light: '#FFFFFF' },
        }).then(setQr).catch(() => setQr(''));
    }, [joinUrl]);

    // onClose cambia de identidad en cada render del panel, y el panel
    // re-renderiza cada 2,5s por el poll. Si el efecto de abajo dependiera
    // de él, se limpiaría y volvería a montar todo el tiempo: cada limpieza
    // hace exitFullscreen(), eso dispara fullscreenchange, y la proyección
    // se cierra sola a los dos segundos de abrirla. Por eso va por ref.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    /**
     * La pantalla completa es una mejora, no el soporte de la proyección.
     *
     * Antes, salir de pantalla completa cerraba la proyección: eran el
     * mismo estado. Eso la volvía rehén de cualquier cosa que el navegador
     * decidiera hacer con el modo pantalla completa — y si el navegador la
     * niega, o la corta, la pared se queda sin nada en el peor momento.
     *
     * Ahora el overlay se sostiene solo (position: fixed, inset: 0, tapa
     * todo igual sin pantalla completa). Se sale por Esc o por la X, y por
     * nada más. Si requestFullscreen falla, se ve igual, apenas con la
     * barra del navegador arriba.
     */
    useEffect(() => {
        shellRef.current?.requestFullscreen?.().catch(() => { /* se ve bien igual */ });
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        };
        // Solo al montar y desmontar: ver el comentario de onCloseRef.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const live = activity && activity.status !== 'closed' ? activity : null;

    /**
     * Va en un portal al body, no donde está el componente: la página de
     * clase en vivo usa .animate-in, que deja un transform aplicado, y un
     * ancestro con transform convierte a position:fixed en relativo a él.
     * Sin esto el "pantalla completa" queda encajado debajo de la topbar.
     */
    return createPortal(
        <div className="pv-shell" ref={shellRef}>
            <header className="pv-top">
                <div className="pv-title">
                    <span className="pv-dot" />
                    <span>{session.title}</span>
                </div>
                <div className="pv-top-right">
                    {session.guestsEnabled && connected > 0 && (
                        <span className="pv-connected"><Users size={22} /> {connected} conectados</span>
                    )}
                    <button className="pv-close" onClick={onClose} title="Salir (Esc)"><X size={22} /></button>
                </div>
            </header>

            {!live ? (
                <JoinBoard code={session.joinCode} qr={qr} url={joinUrl} />
            ) : (
                <main className="pv-main">
                    <h1 className="pv-question">
                        {live.config.question || LIVE_KIND_META[live.kind].label}
                    </h1>

                    {results && results.responded > 0 ? (
                        <Board activity={live} results={results} />
                    ) : (
                        <p className="pv-waiting">Esperando respuestas<span className="pv-dots" /></p>
                    )}

                    <footer className="pv-bottom">
                        {results && (
                            <span className="pv-count">
                                {results.responded}
                                <span className="pv-count-total"> / {results.courseTotal}</span>
                            </span>
                        )}
                        {/* Los que llegan tarde también tienen que poder entrar */}
                        {session.guestsEnabled && session.joinCode && qr && (
                            <span className="pv-mini-join">
                                <img src={qr} alt="" className="pv-mini-qr" />
                                <span className="pv-mini-code">{session.joinCode}</span>
                            </span>
                        )}
                    </footer>
                </main>
            )}

            <Emojis reactions={reactions} />
        </div>,
        document.body,
    );
}

/**
 * Los emojis que manda la sala, subiendo por el costado derecho.
 *
 * El poll trae los del último minuto cada 2,5 s: si se dibujaran todos cada
 * vez, los mismos emojis volverían a salir una y otra vez. Cada uno sale una
 * sola vez, cuando aparece por primera vez, y se va solo a los 5 s.
 */
function Emojis({ reactions }: { reactions: { emoji: string; createdAt: string }[] }) {
    const vistos = useRef<Set<string> | null>(null);
    const timers = useRef<number[]>([]);
    const [flotando, setFlotando] = useState<{ id: string; emoji: string; x: number }[]>([]);

    useEffect(() => {
        const claves = reactions.map((r, i) => `${r.createdAt}|${r.emoji}|${reactions.slice(0, i).filter(o => o.createdAt === r.createdAt && o.emoji === r.emoji).length}`);
        // Al abrir la proyección, lo que ya estaba no se tira de golpe
        if (vistos.current === null) { vistos.current = new Set(claves); return; }
        const nuevos = reactions
            .map((r, i) => ({ r, clave: claves[i] }))
            .filter(({ clave }) => !vistos.current!.has(clave))
            .slice(0, 12);
        claves.forEach(c => vistos.current!.add(c));
        if (!nuevos.length) return;
        const agregados = nuevos.map(({ r, clave }, i) => ({ id: `${clave}-${Date.now()}-${i}`, emoji: r.emoji, x: Math.random() }));
        const ids = new Set(agregados.map(a => a.id));
        // Entran en el próximo cuadro y se van solos. Los timers no se cortan
        // cuando llega el poll siguiente: solo al cerrar la proyección.
        timers.current.push(window.setTimeout(() => setFlotando(prev => [...prev, ...agregados].slice(-30)), 0));
        timers.current.push(window.setTimeout(() => setFlotando(prev => prev.filter(f => !ids.has(f.id))), 5500));
    }, [reactions]);

    useEffect(() => () => { timers.current.forEach(t => window.clearTimeout(t)); }, []);

    // Contador del último minuto: se lee aunque no esté mirando justo cuando sube
    const cuenta = reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {});
    const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="pv-emojis" aria-hidden="true">
            {flotando.map((f, i) => (
                <span key={f.id} className="pv-emoji" style={{ right: `${2 + f.x * 20}vw`, animationDelay: `${(i % 6) * 0.22}s` }}>{f.emoji}</span>
            ))}
            {orden.length > 0 && (
                <div className="pv-emojis-cuenta">
                    {orden.map(([emoji, n]) => <span key={emoji}>{emoji} {n}</span>)}
                </div>
            )}
        </div>
    );
}

/** Pantalla de espera: lo que está proyectado mientras la gente entra. */
function JoinBoard({ code, qr, url }: {
    code: string | null; qr: string; url: string;
}) {
    if (!code) {
        return (
            <main className="pv-main pv-center">
                <p className="pv-waiting">Abrí la sala a invitados para mostrar el QR.</p>
            </main>
        );
    }
    return (
        <main className="pv-main pv-join">
            <div className="pv-join-qr">
                {qr && <img src={qr} alt={`QR para entrar a la sala ${code}`} />}
            </div>
            <div className="pv-join-side">
                <p className="pv-join-kicker">Escaneá con la cámara del celular</p>
                <p className="pv-join-or">o entrá a</p>
                <p className="pv-join-url">{url.replace(/^https?:\/\//, '')}</p>
                <p className="pv-join-or">con el código</p>
                <p className="pv-join-code">{code}</p>
                {/* El contador ya está arriba: acá va lo que baja la barrera
                    para el que todavía tiene el celular en el bolsillo. */}
                <p className="pv-join-foot">No hace falta crear cuenta ni instalar nada</p>
            </div>
        </main>
    );
}

/** Los resultados, en grande. */
function Board({ activity, results }: { activity: LiveActivity; results: LiveResults }) {
    if (activity.kind === 'nube') {
        const max = Math.max(...results.words.map(w => w.n), 1);
        return (
            <div className="pv-cloud">
                {results.words.map(w => (
                    <span
                        key={w.word}
                        className="pv-word"
                        // El tamaño es la frecuencia: se lee de un vistazo cuál pesa
                        style={{ fontSize: `${1.6 + (w.n / max) * 4.4}vw`, opacity: 0.55 + (w.n / max) * 0.45 }}
                    >
                        {w.word}
                    </span>
                ))}
            </div>
        );
    }

    if (activity.kind === 'texto') {
        return (
            <div className="pv-texts">
                {results.texts.slice(0, 12).map(t => (
                    <div key={t.id} className="pv-text-card">{t.text}</div>
                ))}
            </div>
        );
    }

    // Barras: quiz, encuesta, multi-selección y check-in
    const entries = activity.kind === 'checkin'
        ? (Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][])
            .map(([key, meta]) => ({ id: key, label: `${meta.emoji}  ${meta.label}`, n: results.counts[key] ?? 0, correct: false }))
        : (activity.config.options ?? []).map(o => ({
            id: o.id, label: o.label, n: results.counts[o.id] ?? 0,
            correct: activity.config.correctId === o.id,
        }));

    const total = Math.max(entries.reduce((a, e) => a + e.n, 0), 1);
    const revealed = activity.status === 'revealed';

    return (
        <div className="pv-bars">
            {entries.map(e => {
                const pct = Math.round((e.n / total) * 100);
                return (
                    <div key={e.id} className={`pv-bar-row ${revealed && e.correct ? 'correct' : ''}`}>
                        <span className="pv-bar-label">{e.label}{revealed && e.correct && ' ✅'}</span>
                        <div className="pv-bar-track">
                            <div className="pv-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="pv-bar-n">{e.n}</span>
                    </div>
                );
            })}
        </div>
    );
}
