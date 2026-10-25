/**
 * Competencia en la clase en vivo (073): el reloj, el podio y cómo le fue a
 * cada uno. Los puntos los calcula el servidor, y solo de las preguntas ya
 * reveladas: acá nada más se muestran.
 *
 * Nadie ve en qué puesto quedó otro: el podio muestra los tres primeros y
 * cada uno ve el suyo en su celular. El docente ve todos, plegados.
 */

import type { PuestoCompetencia, VistaCompetencia } from '../services/live.service';
import { puntos } from '../lib/competencia';
import './CompetenciaEnVivo.css';

/** La cuenta regresiva: el número y una barra que se achica */
export function RelojCompetencia({ quedan, total, grande = false }: { quedan: number | null; total: number; grande?: boolean }) {
    if (quedan === null) return null;
    const seg = Math.max(0, Math.ceil(quedan));
    const pct = Math.max(0, Math.min(100, (quedan / total) * 100));
    const termino = quedan <= 0;
    return (
        <div className={`cmp-reloj ${grande ? 'grande' : ''} ${seg <= 5 && !termino ? 'apurado' : ''} ${termino ? 'termino' : ''}`}
            role="timer" aria-label={termino ? 'Se terminó el tiempo' : `Quedan ${seg} segundos`}>
            <span className="cmp-reloj-num">{termino ? '¡Tiempo!' : seg}</span>
            <span className="cmp-reloj-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        </div>
    );
}

/** El podio: segundo, primero y tercero (con empates, comparten escalón) */
export function Podio({ podio, grande = false }: { podio: PuestoCompetencia[]; grande?: boolean }) {
    if (podio.length === 0) {
        return <p className="cmp-sin-podio">Todavía nadie sumó puntos.</p>;
    }
    const escalon = (pos: number) => podio.filter(p => p.posicion === pos);
    // Con empate en el primero, no hay segundo: se muestran los escalones que haya
    const lugares = [...new Set(podio.map(p => p.posicion))].sort((a, b) => a - b).slice(0, 3);
    const orden = lugares.length === 3 ? [lugares[1], lugares[0], lugares[2]]
        : lugares.length === 2 ? [lugares[1], lugares[0]] : lugares;
    return (
        <ol className={`cmp-podio ${grande ? 'grande' : ''}`} aria-label="Podio">
            {orden.map(pos => {
                const quienes = escalon(pos);
                const medalla = pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉';
                return (
                    <li key={pos} className={`cmp-escalon cmp-pos-${Math.min(pos, 3)}`}>
                        <span className="cmp-medalla" aria-hidden="true">{medalla}</span>
                        <span className="cmp-nombres">{quienes.map(q => q.nombre).join(' · ')}</span>
                        <span className="cmp-puntos">{puntos(quienes[0].puntos)}</span>
                        <span className="cmp-base"><span className="sr-only">Puesto </span>{pos}°</span>
                    </li>
                );
            })}
        </ol>
    );
}

/** Cómo le fue al que tiene el celular: en la última pregunta y en total */
export function MiResultado({ vista, acerto, respondio, final = false }: {
    vista: VistaCompetencia | null;
    acerto: boolean;
    respondio: boolean;
    final?: boolean;
}) {
    const yo = vista?.yo ?? null;
    return (
        <div className={`cmp-mio ${final ? '' : acerto ? 'bien' : 'mal'}`} role="status">
            {!final && (
                <p className="cmp-mio-titulo">
                    {acerto ? <>¡Correcta! <strong>+{puntos(yo?.ultima ?? 0)}</strong></>
                        : respondio ? 'Esta vez no' : 'No llegaste a responder'}
                </p>
            )}
            {final && <p className="cmp-mio-titulo">🏆 Competencia</p>}
            {yo ? (
                <p className="cmp-mio-puesto">
                    {final ? 'En la última que se reveló ibas' : 'Vas'} <strong>{yo.posicion}°</strong>
                    {vista && vista.participantes > 1 ? ` de ${vista.participantes}` : ''} · {puntos(yo.puntos)} puntos
                </p>
            ) : vista ? (
                <p className="cmp-mio-puesto">Todavía no sumaste puntos: ¡en la próxima!</p>
            ) : (
                <p className="cmp-mio-puesto">Calculando tu lugar…</p>
            )}
        </div>
    );
}

/** Todas las posiciones: solo el docente */
export function TablaPosiciones({ todos }: { todos: NonNullable<VistaCompetencia['todos']> }) {
    return (
        <ol className="cmp-tabla">
            {todos.map((p, i) => (
                <li key={`${p.nombre}-${i}`}>
                    <span className="cmp-tabla-pos">{p.posicion}°</span>
                    <span className="cmp-tabla-nombre">{p.nombre}{p.esInvitado ? <small> (invitado)</small> : null}</span>
                    <span className="cmp-tabla-aciertos">{p.aciertos}/{p.respondidas}</span>
                    <span className="cmp-tabla-puntos">{puntos(p.puntos)}</span>
                </li>
            ))}
        </ol>
    );
}
