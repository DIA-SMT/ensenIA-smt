/**
 * Preguntas del público en el celular (074): el estudiante o el invitado
 * manda su pregunta y vota las de los demás; las más votadas suben.
 * Anónimas entre ellos: el docente sí ve quién preguntó, y se lo decimos.
 */

import { useState } from 'react';
import { ChevronUp, MessageCircleQuestion, Send, Loader2 } from 'lucide-react';
import type { PreguntaPublico } from '../services/live.service';
import './PreguntasEnVivo.css';

interface Props {
    abiertas: boolean;
    preguntas: PreguntaPublico[];
    enviar: (texto: string) => Promise<void>;
    votar: (id: string, voto: boolean) => Promise<void>;
    /** El mensaje para un error (cada pantalla sabe leer los suyos) */
    motivo: (err: unknown) => string;
    /** Que la lista se actualice ya, sin esperar la próxima vuelta */
    refrescar: () => void;
    invitado?: boolean;
}

export default function PreguntarEnVivo({ abiertas, preguntas, enviar, votar, motivo, refrescar, invitado = false }: Props) {
    const [borrador, setBorrador] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    // El voto se ve enseguida; si el servidor no lo toma, vuelve atrás
    const [votosLocales, setVotosLocales] = useState<Record<string, boolean>>({});
    // Mientras sale un voto, ese botón espera (dos toques seguidos llegaban en otro orden)
    const [votando, setVotando] = useState<Set<string>>(() => new Set());

    if (!abiertas && preguntas.length === 0) return null;

    const mandar = async (e: React.FormEvent) => {
        e.preventDefault();
        const texto = borrador.trim();
        if (texto.length < 3 || enviando) return;
        setEnviando(true);
        setError('');
        setAviso('');
        try {
            await enviar(texto);
            setBorrador('');
            setAviso('¡Listo! Ya está en la lista.');
            refrescar();
        } catch (err) {
            // El borrador queda: se puede volver a intentar
            setError(motivo(err));
        } finally {
            setEnviando(false);
        }
    };

    const alternarVoto = async (p: PreguntaPublico) => {
        if (votando.has(p.id)) return;
        const ahora = votosLocales[p.id] ?? p.vote;
        setVotosLocales(v => ({ ...v, [p.id]: !ahora }));
        setVotando(s => new Set(s).add(p.id));
        setError('');
        try {
            await votar(p.id, !ahora);
            refrescar();
        } catch (err) {
            setVotosLocales(v => { const resto = { ...v }; delete resto[p.id]; return resto; });
            setError(motivo(err));
        } finally {
            setVotando(s => { const resto = new Set(s); resto.delete(p.id); return resto; });
        }
    };

    const conVoto = (p: PreguntaPublico) => {
        const local = votosLocales[p.id];
        if (local === undefined || local === p.vote) return { vote: p.vote, votos: p.votos };
        return { vote: local, votos: Math.max(0, p.votos + (local ? 1 : -1)) };
    };

    const enLista = preguntas.filter(p => p.estado !== 'respondida');
    const respondidas = preguntas.filter(p => p.estado === 'respondida');

    const fila = (p: PreguntaPublico) => {
        const { vote, votos } = conVoto(p);
        const sePuedeVotar = !p.mia && p.estado === 'visible';
        return (
            <li key={p.id} className={`pq-item ${p.destacada ? 'destacada' : ''} ${p.mia ? 'mia' : ''}`}>
                <button type="button" className={`pq-voto ${vote ? 'on' : ''}`} disabled={!sePuedeVotar || votando.has(p.id)}
                    aria-pressed={sePuedeVotar ? vote : undefined}
                    aria-label={sePuedeVotar ? `${vote ? 'Sacar tu voto' : 'Votar'} (${votos} votos)` : `${votos} votos`}
                    onClick={() => alternarVoto(p)}>
                    <ChevronUp size={16} aria-hidden="true" />
                    <span>{votos}</span>
                </button>
                <span className="pq-texto">
                    {p.texto}
                    {(p.mia || p.estado === 'pendiente' || p.destacada) && (
                        <small>
                            {[p.mia && 'Tuya', p.estado === 'pendiente' && `Esperando que la vea ${invitado ? 'el docente' : 'tu docente'}`, p.destacada && 'En pantalla']
                                .filter(Boolean).join(' · ')}
                        </small>
                    )}
                </span>
            </li>
        );
    };

    return (
        <section className="card pq" aria-labelledby="pq-titulo">
            <h4 id="pq-titulo"><MessageCircleQuestion size={16} aria-hidden="true" /> Preguntas</h4>
            {abiertas ? (
                <form className="pq-form" onSubmit={mandar}>
                    <label htmlFor="pq-borrador" className="sr-only">Tu pregunta</label>
                    <textarea id="pq-borrador" className="cv-input" rows={2} maxLength={200}
                        placeholder="Escribí tu pregunta…" value={borrador}
                        onChange={e => { setBorrador(e.target.value); setAviso(''); }} />
                    <div className="pq-pie">
                        <span className="text-xs text-subtle">
                            {invitado ? 'Los demás no ven tu nombre; el docente sí.' : 'Tus compañeros no ven quién la hizo; tu docente sí.'}
                        </span>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={enviando || borrador.trim().length < 3}>
                            {enviando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />} Preguntar
                        </button>
                    </div>
                </form>
            ) : (
                <p className="text-xs text-subtle">Las preguntas están cerradas.</p>
            )}
            {error && <p className="pq-error" role="alert">{error}</p>}
            {aviso && <p className="pq-aviso" role="status">{aviso}</p>}
            {enLista.length > 0 ? (
                <ol className="pq-lista">{enLista.map(fila)}</ol>
            ) : abiertas && (
                <p className="text-xs text-subtle">Todavía no hay preguntas. ¡Animate a la primera!</p>
            )}
            {respondidas.length > 0 && (
                <details className="pq-respondidas">
                    <summary>Respondidas ({respondidas.length})</summary>
                    <ol className="pq-lista">{respondidas.map(fila)}</ol>
                </details>
            )}
        </section>
    );
}
