/**
 * Generar un diagrama o un juego de palabras a partir del material.
 *
 * La IA propone (datos), el docente corrige y guarda. Lo que se guarda en
 * Mis materiales es liviano para los chicos: el diagrama como PNG y el juego
 * ya armado.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Sparkles, Download, BookmarkPlus, RefreshCw, Trash2, Plus, Network, Puzzle, FileText } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import JuegoPalabrasVista from './JuegoPalabrasVista';
import { avisar } from './ui/avisar';
import { VARIANTES, type Diagrama, type VarianteDiagrama } from '../lib/diagramas';
import { type JuegoPalabras, type PalabraPista } from '../lib/juegos';
import { armarCrucigrama, armarCriptograma } from '../lib/armarJuegos';
import { generarDiagrama, generarDatosJuego, guardarDiagrama, guardarJuego, type DatosJuego } from '../services/visuales.service';
import type { LibraryMaterial } from '../types';
// Cada pantalla baja solo el CSS que importa: el del diálogo y el del spinner van acá
import './Modals.css';
import './ui/ui.css';
import './GenerarVisual.css';

export interface FuenteVisual {
  /** Texto del material. Vacío = el docente escribe el tema. */
  texto: string;
  titulo: string;
  subjectId: string;
  subjectName: string;
  courseId?: string | null;
  courseName?: string;
  unitName?: string;
}

interface Props {
  abierto: boolean;
  alCerrar: () => void;
  fuente: FuenteVisual | null;
  teacherId: string;
  schoolId: string;
  inicial?: 'diagrama' | 'juego';
  alGuardar?: (material: LibraryMaterial) => void;
}

type Clase = 'diagrama' | 'juego';
type TipoJuego = 'crucigrama' | 'criptograma';

export default function GenerarVisual({ abierto, alCerrar, fuente, teacherId, schoolId, inicial = 'diagrama', alGuardar }: Props) {
  const [clase, setClase] = useState<Clase>(inicial);
  const [variante, setVariante] = useState<VarianteDiagrama>('mapa_mental');
  const [tipoJuego, setTipoJuego] = useState<TipoJuego>('crucigrama');
  const [tema, setTema] = useState('');
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const [diagrama, setDiagrama] = useState<Diagrama | null>(null);
  const [datos, setDatos] = useState<DatosJuego | null>(null);
  const [juego, setJuego] = useState<JuegoPalabras | null>(null);
  const [vuelta, setVuelta] = useState(0); // para rearmar el juego y reiniciar la vista

  // Cada vez que se abre se empieza de cero. Solo al abrir: `fuente` se
  // arma de nuevo en cada render de la pantalla y borraría lo generado.
  useEffect(() => {
    if (!abierto) return;
    setClase(inicial);
    setTema('');
    setDiagrama(null);
    setDatos(null);
    setJuego(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!fuente) return null;
  const sinTexto = !fuente.texto.trim();
  const textoBase = sinTexto ? tema.trim() : fuente.texto;
  const titulo = sinTexto ? (tema.trim().split(/[.\n]/)[0].slice(0, 80) || fuente.titulo) : fuente.titulo;
  const contexto = { subjectName: fuente.subjectName || undefined, courseName: fuente.courseName };
  const destino = {
    teacherId, schoolId,
    subjectId: fuente.subjectId, subjectName: fuente.subjectName || 'Materia',
    courseId: fuente.courseId ?? null, unitName: fuente.unitName,
  };

  const armarJuego = (d: DatosJuego, tipo: TipoJuego) => {
    try {
      const j = tipo === 'crucigrama'
        ? armarCrucigrama(d.titulo, d.palabras)
        : armarCriptograma(d.titulo, d.frase, d.pista);
      setJuego(j);
      setVuelta(v => v + 1);
      setError('');
    } catch (e) {
      setJuego(null);
      setError(e instanceof Error ? e.message : 'No se pudo armar el juego.');
    }
  };

  const generar = async () => {
    if (!textoBase) { setError('Escribí el tema o pegá un texto.'); return; }
    setGenerando(true);
    setError('');
    try {
      if (clase === 'diagrama') {
        setDiagrama(await generarDiagrama(textoBase, titulo, variante, contexto));
      } else {
        const d = await generarDatosJuego(textoBase, titulo, contexto);
        setDatos(d);
        armarJuego(d, tipoJuego);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar. Probá de nuevo.');
    } finally {
      setGenerando(false);
    }
  };

  const hayResultado = clase === 'diagrama' ? !!diagrama : !!datos;

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor="gv-titulo" className="dialogo-em gv-dialogo">
      <div className="em-modal gv">
        <div className="em-modal-header">
          <h3 id="gv-titulo">
            {clase === 'diagrama' ? <Network size={17} className="text-cyan" /> : <Puzzle size={17} className="text-cyan" />}
            {' '}{clase === 'diagrama' ? 'Diagrama' : 'Juego de palabras'}{fuente.titulo ? ` — ${fuente.titulo}` : ''}
          </h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={alCerrar}><X size={18} /></button>
        </div>

        <div className="em-modal-body gv-cuerpo">
          {/* ── Qué armar ── */}
          <div className="gv-opciones">
            <div className="gv-tabs" role="group" aria-label="Qué querés armar">
              <button className={clase === 'diagrama' ? 'activo' : ''} aria-pressed={clase === 'diagrama'} onClick={() => setClase('diagrama')} disabled={generando}>
                <Network size={15} /> Diagrama
              </button>
              <button className={clase === 'juego' ? 'activo' : ''} aria-pressed={clase === 'juego'} onClick={() => setClase('juego')} disabled={generando}>
                <Puzzle size={15} /> Juego
              </button>
            </div>

            {clase === 'diagrama' ? (
              <div className="gv-chips" role="group" aria-label="Tipo de diagrama">
                {VARIANTES.map(v => (
                  <button key={v.id} className={`gv-chip ${variante === v.id ? 'activo' : ''}`} aria-pressed={variante === v.id}
                    title={v.para} onClick={() => setVariante(v.id)} disabled={generando}>
                    {v.etiqueta}
                  </button>
                ))}
              </div>
            ) : (
              <div className="gv-chips" role="group" aria-label="Tipo de juego">
                {(['crucigrama', 'criptograma'] as const).map(t => (
                  <button key={t} className={`gv-chip ${tipoJuego === t ? 'activo' : ''}`} aria-pressed={tipoJuego === t}
                    disabled={generando}
                    onClick={() => { setTipoJuego(t); if (datos) armarJuego(datos, t); }}>
                    {t === 'crucigrama' ? 'Crucigrama' : 'Criptograma'}
                  </button>
                ))}
              </div>
            )}
            <p className="gv-ayuda">
              {clase === 'diagrama'
                ? VARIANTES.find(v => v.id === variante)?.para
                : tipoJuego === 'crucigrama'
                  ? 'Palabras clave del tema que se cruzan, con sus pistas.'
                  : 'Una idea central escondida: cada número es una letra.'}
            </p>

            {sinTexto && (
              <div className="em-field">
                <label htmlFor="gv-tema">Tema o texto</label>
                <textarea id="gv-tema" rows={3} value={tema} onChange={e => setTema(e.target.value)}
                  placeholder="Ej: El ciclo del agua. O pegá el texto que vieron en clase." />
              </div>
            )}

            {!hayResultado && (
              <button className="btn btn-primary" onClick={generar} disabled={generando || (sinTexto && !tema.trim())}>
                {generando ? <><Loader2 size={16} className="girando" /> Armando…</> : <><Sparkles size={16} /> Generar con IA</>}
              </button>
            )}
            {error && <div className="em-error" role="alert">{error}</div>}
          </div>

          {/* ── Resultado ── */}
          {clase === 'diagrama' && diagrama && (
            <ResultadoDiagrama
              diagrama={diagrama}
              alCambiar={setDiagrama}
              generando={generando}
              guardando={guardando}
              alRegenerar={generar}
              alGuardar={async png => {
                setGuardando(true);
                try {
                  const mat = await guardarDiagrama(diagrama, png, destino);
                  avisar.exito('Diagrama guardado en Mis materiales', 'Desde ahí lo compartís con el curso o lo proyectás en la clase en vivo.');
                  alGuardar?.(mat);
                  alCerrar();
                } catch (e) {
                  avisar.error('No se pudo guardar el diagrama', e instanceof Error ? e.message : 'Probá de nuevo.');
                } finally {
                  setGuardando(false);
                }
              }}
            />
          )}

          {clase === 'juego' && datos && (
            <ResultadoJuego
              datos={datos}
              juego={juego}
              vuelta={vuelta}
              materia={fuente.subjectName}
              generando={generando}
              guardando={guardando}
              alRegenerar={generar}
              alCorregir={d => { setDatos(d); armarJuego(d, tipoJuego); }}
              alRearmar={() => armarJuego(datos, tipoJuego)}
              alGuardar={async () => {
                if (!juego) return;
                setGuardando(true);
                try {
                  const mat = await guardarJuego(juego, destino);
                  avisar.exito(`${juego.tipo === 'crucigrama' ? 'Crucigrama' : 'Criptograma'} guardado en Mis materiales`, 'Compartilo con el curso y lo juegan desde el celular.');
                  alGuardar?.(mat);
                  alCerrar();
                } catch (e) {
                  avisar.error('No se pudo guardar el juego', e instanceof Error ? e.message : 'Probá de nuevo.');
                } finally {
                  setGuardando(false);
                }
              }}
            />
          )}
        </div>
      </div>
    </Dialogo>
  );
}

// ── Diagrama: se dibuja y se corrige ──

function ResultadoDiagrama({ diagrama, alCambiar, generando, guardando, alRegenerar, alGuardar }: {
  diagrama: Diagrama;
  alCambiar: (d: Diagrama) => void;
  generando: boolean;
  guardando: boolean;
  alRegenerar: () => void;
  alGuardar: (png: Blob) => void;
}) {
  const [svg, setSvg] = useState('');
  const [fallo, setFallo] = useState('');
  const [dibujando, setDibujando] = useState(true);
  const ultimo = useRef(0);

  // Se vuelve a dibujar al corregir, con una pausa para no hacerlo en cada tecla
  useEffect(() => {
    const turno = ++ultimo.current;
    setDibujando(true);
    const t = setTimeout(async () => {
      try {
        const { dibujarDiagrama } = await import('../lib/dibujarDiagrama');
        const s = await dibujarDiagrama(diagrama);
        if (turno === ultimo.current) { setSvg(s); setFallo(''); }
      } catch (e) {
        if (turno === ultimo.current) setFallo(e instanceof Error ? e.message : 'No se pudo dibujar.');
      } finally {
        if (turno === ultimo.current) setDibujando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [diagrama]);

  const aPng = async () => {
    const { svgAPng } = await import('../lib/dibujarDiagrama');
    return svgAPng(svg);
  };

  const descargar = async () => {
    try {
      const png = await aPng();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = `${diagrama.titulo.normalize('NFKD').replace(/[^\w\- ]/g, '').trim() || 'diagrama'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      avisar.error('No se pudo bajar la imagen', e instanceof Error ? e.message : '');
    }
  };

  const set = (cambios: Partial<Diagrama>) => alCambiar({ ...diagrama, ...cambios });

  return (
    <div className="gv-resultado">
      <div className="gv-lienzo" aria-busy={dibujando}>
        {fallo
          ? <div className="em-error" role="alert">No se pudo dibujar: {fallo}</div>
          : svg
            ? <div className="gv-svg" role="img" aria-label={diagrama.descripcion || diagrama.titulo} dangerouslySetInnerHTML={{ __html: svg }} />
            : <div className="gv-cargando"><Loader2 size={22} className="girando" /> Dibujando…</div>}
      </div>

      <details className="gv-corregir">
        <summary>Corregir los textos</summary>
        <div className="em-field">
          <label htmlFor="gv-diag-titulo">Título</label>
          <input id="gv-diag-titulo" type="text" value={diagrama.titulo} maxLength={100} onChange={e => set({ titulo: e.target.value })} />
        </div>

        {diagrama.variante === 'mapa_mental' && (
          <div className="gv-lista">
            {diagrama.ramas.map((r, i) => (
              <div key={i} className="gv-item">
                <div className="gv-fila">
                  <input type="text" aria-label={`Idea ${i + 1}`} value={r.texto} maxLength={80}
                    onChange={e => set({ ramas: diagrama.ramas.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) })} />
                  <button className="btn-icon" aria-label="Quitar idea" disabled={diagrama.ramas.length <= 2}
                    onClick={() => set({ ramas: diagrama.ramas.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
                </div>
                {r.hijos.map((h, j) => (
                  <div key={j} className="gv-fila gv-hijo">
                    <input type="text" aria-label={`Subidea ${j + 1} de ${r.texto}`} value={h} maxLength={80}
                      onChange={e => set({ ramas: diagrama.ramas.map((x, k) => (k === i ? { ...x, hijos: x.hijos.map((y, m) => (m === j ? e.target.value : y)) } : x)) })} />
                    <button className="btn-icon" aria-label="Quitar subidea"
                      onClick={() => set({ ramas: diagrama.ramas.map((x, k) => (k === i ? { ...x, hijos: x.hijos.filter((_, m) => m !== j) } : x)) })}><Trash2 size={14} /></button>
                  </div>
                ))}
                {r.hijos.length < 5 && (
                  <button className="gv-agregar gv-hijo" onClick={() => set({ ramas: diagrama.ramas.map((x, k) => (k === i ? { ...x, hijos: [...x.hijos, 'Nueva subidea'] } : x)) })}>
                    <Plus size={13} /> Subidea
                  </button>
                )}
              </div>
            ))}
            {diagrama.ramas.length < 7 && (
              <button className="gv-agregar" onClick={() => set({ ramas: [...diagrama.ramas, { texto: 'Nueva idea', hijos: [] }] })}><Plus size={13} /> Idea</button>
            )}
          </div>
        )}

        {diagrama.variante === 'linea_tiempo' && (
          <div className="gv-lista">
            {diagrama.eventos.map((ev, i) => (
              <div key={i} className="gv-fila">
                <input type="text" className="gv-fecha" aria-label={`Fecha del hecho ${i + 1}`} value={ev.fecha} maxLength={30}
                  onChange={e => set({ eventos: diagrama.eventos.map((x, k) => (k === i ? { ...x, fecha: e.target.value } : x)) })} />
                <input type="text" aria-label={`Hecho ${i + 1}`} value={ev.texto} maxLength={120}
                  onChange={e => set({ eventos: diagrama.eventos.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) })} />
                <button className="btn-icon" aria-label="Quitar hecho" disabled={diagrama.eventos.length <= 2}
                  onClick={() => set({ eventos: diagrama.eventos.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
            {diagrama.eventos.length < 10 && (
              <button className="gv-agregar" onClick={() => set({ eventos: [...diagrama.eventos, { fecha: 'Año', texto: 'Qué pasó' }] })}><Plus size={13} /> Hecho</button>
            )}
          </div>
        )}

        {(diagrama.variante === 'flujo' || diagrama.variante === 'ciclo' || diagrama.variante === 'causa_efecto') && (
          <div className="gv-lista">
            {diagrama.nodos.map((n, i) => (
              <div key={n.id} className="gv-fila">
                <input type="text" aria-label={`Recuadro ${i + 1}`} value={n.texto} maxLength={80}
                  onChange={e => set({ nodos: diagrama.nodos.map(x => (x.id === n.id ? { ...x, texto: e.target.value } : x)) })} />
                <button className="btn-icon" aria-label="Quitar recuadro" disabled={diagrama.nodos.length <= 2}
                  onClick={() => set({
                    nodos: diagrama.nodos.filter(x => x.id !== n.id),
                    conexiones: diagrama.conexiones.filter(c => c.desde !== n.id && c.hacia !== n.id),
                  })}><Trash2 size={14} /></button>
              </div>
            ))}
            {diagrama.conexiones.some(c => c.etiqueta) && <p className="gv-ayuda">Rótulos de las flechas:</p>}
            {diagrama.conexiones.map((c, i) => c.etiqueta !== '' && (
              <div key={`c${i}`} className="gv-fila">
                <input type="text" aria-label={`Rótulo de la flecha ${i + 1}`} value={c.etiqueta} maxLength={30}
                  onChange={e => set({ conexiones: diagrama.conexiones.map((x, k) => (k === i ? { ...x, etiqueta: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        )}
      </details>

      <div className="gv-acciones">
        <button className="btn btn-outline btn-sm" onClick={alRegenerar} disabled={generando || guardando}>
          {generando ? <Loader2 size={14} className="girando" /> : <RefreshCw size={14} />} Otro diagrama
        </button>
        <button className="btn btn-outline btn-sm" onClick={descargar} disabled={!svg || !!fallo}>
          <Download size={14} /> Bajar imagen
        </button>
        <button className="btn btn-primary btn-sm" disabled={!svg || !!fallo || guardando || dibujando}
          onClick={async () => {
            try { alGuardar(await aPng()); } catch (e) { avisar.error('No se pudo guardar', e instanceof Error ? e.message : ''); }
          }}>
          {guardando ? <Loader2 size={14} className="girando" /> : <BookmarkPlus size={14} />} Guardar en Mis materiales
        </button>
      </div>
    </div>
  );
}

// ── Juego: se prueba, se corrige, se imprime ──

function ResultadoJuego({ datos, juego, vuelta, materia, generando, guardando, alRegenerar, alCorregir, alRearmar, alGuardar }: {
  datos: DatosJuego;
  juego: JuegoPalabras | null;
  vuelta: number;
  materia: string;
  generando: boolean;
  guardando: boolean;
  alRegenerar: () => void;
  alCorregir: (d: DatosJuego) => void;
  alRearmar: () => void;
  alGuardar: () => void;
}) {
  const [borrador, setBorrador] = useState<DatosJuego>(datos);
  useEffect(() => setBorrador(datos), [datos]);
  const cambiado = useMemo(() => JSON.stringify(borrador) !== JSON.stringify(datos), [borrador, datos]);

  const pdf = async (conSolucion: boolean) => {
    if (!juego) return;
    const { juegoAPdf } = await import('../lib/juegosPdf');
    juegoAPdf(juego, { materia, conSolucion });
  };

  const setPalabra = (i: number, cambio: Partial<PalabraPista>) =>
    setBorrador(b => ({ ...b, palabras: b.palabras.map((p, k) => (k === i ? { ...p, ...cambio } : p)) }));

  return (
    <div className="gv-resultado">
      {juego && (
        <div className="gv-juego">
          <h4 className="gv-juego-titulo">{juego.tipo === 'crucigrama' ? 'Crucigrama' : 'Criptograma'}: {juego.titulo}</h4>
          <p className="gv-ayuda">Probalo como lo van a ver tus estudiantes.</p>
          <JuegoPalabrasVista key={vuelta} juego={juego} />
        </div>
      )}

      <details className="gv-corregir">
        <summary>{juego?.tipo === 'criptograma' ? 'Corregir la frase' : 'Corregir palabras y pistas'}</summary>
        {juego?.tipo === 'criptograma' ? (
          <>
            <div className="em-field">
              <label htmlFor="gv-frase">Frase</label>
              <input id="gv-frase" type="text" value={borrador.frase} maxLength={90} onChange={e => setBorrador(b => ({ ...b, frase: e.target.value }))} />
            </div>
            <div className="em-field">
              <label htmlFor="gv-pista-frase">Pista</label>
              <input id="gv-pista-frase" type="text" value={borrador.pista} maxLength={140} onChange={e => setBorrador(b => ({ ...b, pista: e.target.value }))} />
            </div>
          </>
        ) : (
          <div className="gv-lista">
            {borrador.palabras.map((p, i) => (
              <div key={i} className="gv-fila">
                <input type="text" className="gv-respuesta" aria-label={`Palabra ${i + 1}`} value={p.respuesta} maxLength={14}
                  onChange={e => setPalabra(i, { respuesta: e.target.value })} />
                <input type="text" aria-label={`Pista de ${p.respuesta}`} value={p.pista} maxLength={140}
                  onChange={e => setPalabra(i, { pista: e.target.value })} />
                <button className="btn-icon" aria-label="Quitar palabra" disabled={borrador.palabras.length <= 4}
                  onClick={() => setBorrador(b => ({ ...b, palabras: b.palabras.filter((_, k) => k !== i) }))}><Trash2 size={14} /></button>
              </div>
            ))}
            {borrador.palabras.length < 14 && (
              <button className="gv-agregar" onClick={() => setBorrador(b => ({ ...b, palabras: [...b.palabras, { respuesta: '', pista: '' }] }))}>
                <Plus size={13} /> Palabra
              </button>
            )}
          </div>
        )}
        <button className="btn btn-secondary btn-sm" disabled={!cambiado} onClick={() => alCorregir({
          ...borrador, palabras: borrador.palabras.filter(p => p.respuesta.trim() && p.pista.trim()),
        })}>
          Aplicar cambios
        </button>
      </details>

      <div className="gv-acciones">
        <button className="btn btn-outline btn-sm" onClick={alRegenerar} disabled={generando || guardando}>
          {generando ? <Loader2 size={14} className="girando" /> : <Sparkles size={14} />} Otras palabras
        </button>
        {juego?.tipo === 'crucigrama' && (
          <button className="btn btn-outline btn-sm" onClick={alRearmar} disabled={generando}>
            <RefreshCw size={14} /> Otro armado
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => pdf(false)} disabled={!juego}>
          <FileText size={14} /> PDF para imprimir
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => pdf(true)} disabled={!juego}>
          <FileText size={14} /> PDF con solución
        </button>
        <button className="btn btn-primary btn-sm" onClick={alGuardar} disabled={!juego || guardando}>
          {guardando ? <Loader2 size={14} className="girando" /> : <BookmarkPlus size={14} />} Guardar en Mis materiales
        </button>
      </div>
    </div>
  );
}
