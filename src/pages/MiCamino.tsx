/**
 * Mi camino Docente Tech (082): el nivel, las medallas y los trofeos del
 * docente por usar la plataforma, con el mismo peso para lo humano.
 * Sin ranking: lo ve él (y la dirección solo si comparte su perfil). Desde
 * el nivel 2 baja un certificado para sus antecedentes.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Lock, Users, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMiCamino, getMetaEscuela, type MiCamino as Camino, type MetaEscuela } from '../services/camino.service';
import {
  EMOJI_GRADO, GRADOS, LADOS, NIVELES, QUE_SUMA, medallasDe, nivelInfo, progresoDe, trofeosDe,
} from '../lib/caminoDocente';
import { avisar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import './MiCamino.css';

export default function MiCamino() {
  const { user, school } = useAuth();
  const [camino, setCamino] = useState<Camino | null>(null);
  const [meta, setMeta] = useState<MetaEscuela | null>(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setError('');
    getMiCamino()
      .then(c => { if (vigente) setCamino(c); })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar tu camino.'); });
    getMetaEscuela().then(m => { if (vigente) setMeta(m); }).catch(() => { /* la meta es un extra */ });
    return () => { vigente = false; };
  }, [intento]);

  if (!user) return null;
  if (error) {
    return (
      <div className="cam-contenedor">
        <EstadoVacio titulo="No se pudo cargar tu camino" texto={`${error} Puede ser la conexión.`}
          accion={{ etiqueta: 'Reintentar', alTocar: () => setIntento(n => n + 1) }} />
      </div>
    );
  }
  if (!camino) return <div className="cam-contenedor"><Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Armando tu camino…" /></div>;

  const nivel = nivelInfo(camino.nivel);
  const siguiente = NIVELES[camino.nivel];
  const { pct, faltan } = progresoDe(camino);
  const medallas = medallasDe(camino);
  const trofeos = trofeosDe(camino, camino.nivel);
  const ganadas = medallas.filter(m => m.grado > 0).length;

  const certificado = async () => {
    setBajando(true);
    try {
      const { descargarCertificado } = await import('../lib/certificadoCamino');
      await descargarCertificado({ nombre: `${user.firstName} ${user.lastName}`, escuela: school?.name, nivel: camino.nivel, numeros: camino });
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo armar el certificado', 'Probá de nuevo en un momento.');
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="cam-contenedor">
      {/* ── El nivel ── */}
      <section className="card cam-nivel" aria-labelledby="cam-nivel-t">
        <span className="cam-nivel-emoji" aria-hidden="true">{nivel.emoji}</span>
        <div className="cam-nivel-texto">
          <p className="cam-sobre">Camino Docente Tech {camino.anio} · Nivel {camino.nivel} de {NIVELES.length}</p>
          <h2 id="cam-nivel-t">{nivel.nombre}</h2>
          <p className="cam-lema">{nivel.lema}</p>
          <div className="cam-barra" role="progressbar" aria-label="Avance hacia el nivel que sigue" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="cam-falta">
            <strong>{camino.puntos} puntos</strong>
            {faltan !== null && siguiente ? ` · ${faltan} para «${siguiente.nombre}» ${siguiente.emoji}` : ' · ¡Llegaste al nivel más alto!'}
          </p>
          <ul className="cam-chips">
            <li>🔥 {camino.racha === 1 ? '1 semana seguida' : `${camino.racha} semanas seguidas`}</li>
            <li>🏅 {ganadas} {ganadas === 1 ? 'medalla' : 'medallas'} · {medallas.filter(m => m.grado === 3).length} de oro</li>
            <li>🏆 {trofeos.filter(t => t.logrado).length} de {trofeos.length} trofeos</li>
          </ul>
        </div>
        <div className="cam-certificado">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void certificado()} disabled={bajando || camino.nivel < 2}>
            <Download size={15} aria-hidden="true" /> {bajando ? 'Armando…' : 'Bajar mi certificado'}
          </button>
          {camino.nivel < 2 && <small>Desde el nivel «{NIVELES[1].nombre}»</small>}
        </div>
      </section>

      <p className="cam-privado">
        <Lock size={14} aria-hidden="true" />
        <span>
          Esto lo ves vos: no hay ranking ni comparación con nadie. La dirección lo ve solo si compartís tu perfil
          (<Link to="/perfil">Mi perfil</Link> → "Que lo vea la dirección de tu escuela").
        </span>
      </p>

      {/* ── Las medallas: tecnología y humanidad, con el mismo peso ── */}
      {LADOS.map(l => (
        <section key={l.lado} className="card cam-lado" aria-labelledby={`cam-${l.lado}`}>
          <div className="cam-lado-cabecera">
            <h3 id={`cam-${l.lado}`}>{l.titulo}</h3>
            <p>{l.texto}</p>
          </div>
          <ul className="cam-medallas">
            {medallas.filter(m => m.pilar.lado === l.lado).map(m => {
              const desde = m.grado === 0 ? 0 : m.pilar.umbrales[m.grado - 1];
              const avance = m.siguiente ? Math.round((100 * (m.valor - desde)) / Math.max(1, m.siguiente.umbral - desde)) : 100;
              return (
                <li key={m.pilar.clave} className={`cam-medalla g${m.grado}`}>
                  <span className="cam-medalla-emoji" aria-hidden="true">{m.pilar.emoji}</span>
                  <div className="cam-medalla-texto">
                    <strong>{m.pilar.medalla}</strong>
                    <span className="cam-grado">{m.grado > 0 ? `${EMOJI_GRADO[m.grado]} ${GRADOS[m.grado]}` : 'Todavía no'}</span>
                    <small>{m.valor} {m.pilar.unidad}</small>
                    {m.siguiente && (
                      <>
                        <span className="cam-mini-barra" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, avance))}%` }} /></span>
                        <small className="cam-siguiente">
                          {m.siguiente.umbral - m.valor} más para {GRADOS[m.siguiente.grado].toLowerCase()}
                          {m.grado === 0 ? ` · ${m.pilar.idea}` : ''}
                        </small>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── Trofeos ── */}
      <section className="card cam-lado" aria-labelledby="cam-trofeos">
        <div className="cam-lado-cabecera">
          <h3 id="cam-trofeos">Trofeos</h3>
          <p>Los grandes logros del año.</p>
        </div>
        <ul className="cam-trofeos">
          {trofeos.map(t => (
            <li key={t.clave} className={`cam-trofeo ${t.logrado ? 'logrado' : ''}`}>
              <span className="cam-trofeo-emoji" aria-hidden="true">{t.logrado ? t.emoji : '🔒'}</span>
              <strong>{t.nombre}</strong>
              <small>{t.logrado ? '¡Logrado!' : t.texto}</small>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Entre todos ── */}
      {meta && (
        <section className="card cam-lado" aria-labelledby="cam-escuela">
          <div className="cam-lado-cabecera">
            <h3 id="cam-escuela"><Users size={17} aria-hidden="true" /> Entre todos en {school?.name ?? 'tu escuela'}, este mes</h3>
            <p>Lo de toda la escuela junta, sin nombres.</p>
          </div>
          <dl className="cam-meta">
            <div><dt>Clases en vivo</dt><dd>{meta.clasesEnVivo}</dd></div>
            <div><dt>Actividades</dt><dd>{meta.actividades}</dd></div>
            <div><dt>Materiales</dt><dd>{meta.materiales}</dd></div>
            <div><dt>Devoluciones escritas</dt><dd>{meta.devoluciones}</dd></div>
          </dl>
          {meta.docentes > 0 && (
            <p className="cam-nota">{meta.docentesEstaSemana} de {meta.docentes} docentes usaron EstudIA esta semana.</p>
          )}
        </section>
      )}

      {/* ── Cómo se suman ── */}
      <details className="card cam-como">
        <summary><Info size={16} aria-hidden="true" /> Cómo se suman los puntos</summary>
        <p className="cam-nota">
          Se cuenta solo lo que hiciste este año en la app; abrirla sin hacer nada no suma. Una clase en vivo cuenta
          si duró 5 minutos o más. Los niveles empiezan en {camino.umbrales.slice(1).map((u, i) => `${u} (${NIVELES[i + 1].nombre})`).join(', ')}.
        </p>
        <ul className="cam-pesos">
          {Object.entries(camino.pesos).map(([k, v]) => (
            <li key={k}><span>{QUE_SUMA[k] ?? k}</span><strong>+{v}</strong></li>
          ))}
        </ul>
      </details>
    </div>
  );
}
