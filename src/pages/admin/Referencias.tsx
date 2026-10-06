/**
 * Superadmin: la Biblioteca de referencia. Leyes, resoluciones, NAP, ESI,
 * diseño curricular y técnicas pedagógicas comunes a todas las escuelas
 * municipales. La IA (Laboratorio, Crear, Migue) busca en lo publicado y
 * lo cita con su número de norma: por eso cada documento se guarda
 * partido en fragmentos que se entienden solos.
 *
 * Flujo: datos del documento → contenido (archivo o texto pegado) →
 * "Partir en fragmentos" → revisar → guardar como borrador → publicar
 * (aparte, con confirmación: desde ahí la IA lo cita).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ChevronDown, ChevronUp, ExternalLink, FileText, Info, Library, Merge, Plus,
  RotateCcw, Scissors, Search, Send, Trash2, Upload, Users, X, EyeOff, Ban,
} from 'lucide-react';
import {
  listarReferencias, obtenerReferencia, crearReferencia, actualizarReferencia, borrarReferencia,
  publicarReferencia, marcarVigencia, guardarFragmentos,
  CAPAS, TIPOS, CAPA_LABELS, TIPO_LABELS, ESTADO_LABELS, MAX_TEXTO_FRAGMENTO, estadoDe,
  type Referencia, type CapaReferencia, type TipoReferencia, type AudienciaReferencia, type EstadoReferencia,
} from '../../services/referencias.service';
import { getSubjects } from '../../services/subjects.service';
import { leerTextoDeArchivo } from '../../services/documents.service';
import { fragmentar, partirEnDos, MAX_FRAGMENTO } from '../../lib/fragmentar';
import { avisar, confirmar } from '../../components/ui/avisar';
import { Esqueleto, Cargando } from '../../components/ui/Esqueleto';
import EstadoVacio from '../../components/ui/EstadoVacio';
import Dialogo from '../../components/shell/Dialogo';
import { Campo } from './ui';
import './Admin.css';
import './Referencias.css';

const ESTADO_BADGE: Record<EstadoReferencia, string> = {
  publicada: 'badge-success',
  borrador: 'badge-warning',
  no_vigente: 'badge-neutral',
};

const ANIOS_BASE = [1, 2, 3, 4, 5, 6];

const fechaLarga = (f: string | null) =>
  f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');

const etiquetaAnios = (anios: number[]) =>
  anios.length === 0 ? 'Todos los años' : `${anios.map(a => `${a}°`).join(', ')} año${anios.length > 1 ? 's' : ''}`;

let ultimaClave = 0;
const nuevaClave = () => `f${++ultimaClave}`;

// ═══════════════════════════════════════════════════════════════════
// Lista
// ═══════════════════════════════════════════════════════════════════

export default function Referencias() {
  const [docs, setDocs] = useState<Referencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [materias, setMaterias] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [capa, setCapa] = useState<CapaReferencia | ''>('');
  const [tipo, setTipo] = useState<TipoReferencia | ''>('');
  const [estado, setEstado] = useState<EstadoReferencia | ''>('');
  // null: cerrado · { id: null }: documento nuevo
  const [editor, setEditor] = useState<{ id: string | null; clave: number } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    listarReferencias()
      .then(d => { if (!cancelado) { setDocs(d); setError(''); } })
      .catch(err => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar la biblioteca.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [version]);

  // Sugerencias de áreas: las materias de todas las escuelas, sin repetir
  useEffect(() => {
    let cancelado = false;
    getSubjects()
      .then(s => {
        if (cancelado) return;
        const vistas = new Map<string, string>();
        for (const m of s) if (m.name.trim() && !vistas.has(normalizar(m.name))) vistas.set(normalizar(m.name), m.name.trim());
        setMaterias([...vistas.values()].sort((a, b) => a.localeCompare(b, 'es')));
      })
      .catch(() => { /* sin sugerencias: se escribe a mano */ });
    return () => { cancelado = true; };
  }, []);

  const sugerenciasAreas = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const a of [...materias, ...docs.flatMap(d => d.areas)]) if (!vistas.has(normalizar(a))) vistas.set(normalizar(a), a);
    return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [materias, docs]);

  const filtrados = useMemo(() => {
    const q = normalizar(texto);
    return docs.filter(d =>
      (!capa || d.capa === capa)
      && (!tipo || d.tipo === tipo)
      && (!estado || estadoDe(d) === estado)
      && (!q || normalizar(`${d.titulo} ${d.numero ?? ''} ${d.organismo ?? ''} ${d.resumen ?? ''} ${d.areas.join(' ')}`).includes(q)));
  }, [docs, texto, capa, tipo, estado]);

  const porCapa = (c: CapaReferencia) => docs.filter(d => d.capa === c).length;
  const publicadas = docs.filter(d => estadoDe(d) === 'publicada').length;
  const hayFiltro = Boolean(texto.trim() || capa || tipo || estado);

  const abrir = (id: string | null) => setEditor({ id, clave: Date.now() });
  const recargar = () => setVersion(v => v + 1);
  const limpiarFiltros = () => { setTexto(''); setCapa(''); setTipo(''); setEstado(''); };

  return (
    <div className="adm-container animate-in">
      <header className="adm-head">
        <div>
          <h2><Library size={20} aria-hidden="true" /> Biblioteca de referencia</h2>
          <p>
            {cargando
              ? 'Cargando documentos…'
              : `${docs.length} documento${docs.length !== 1 ? 's' : ''} · ${publicadas} publicado${publicadas !== 1 ? 's' : ''} · común a todas las escuelas municipales`}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => abrir(null)}>
          <Plus size={16} aria-hidden="true" /> Agregar documento
        </button>
      </header>

      {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

      {cargando && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando la biblioteca…" />}

      {!cargando && !error && docs.length === 0 && (
        <EstadoVacio icono={Library} titulo="La biblioteca todavía está vacía"
          texto="Acá va lo común a todas las escuelas municipales: leyes y resoluciones nacionales, provinciales y municipales, los NAP, los lineamientos de ESI y técnicas pedagógicas. La IA del Laboratorio, Crear y Migue busca en lo publicado y lo cita con su número de norma. Cargá cada documento desde su fuente oficial."
          accion={{ etiqueta: 'Agregar documento', icono: Plus, alTocar: () => abrir(null) }} />
      )}

      {!cargando && docs.length > 0 && (
        <div className="rfa-filtros">
          <div className="fila-desplazable" role="group" aria-label="Capa">
            <button type="button" className={`rfa-pastilla${capa === '' ? ' activa' : ''}`} aria-pressed={capa === ''} onClick={() => setCapa('')}>
              Todas <span>{docs.length}</span>
            </button>
            {CAPAS.map(c => (
              <button key={c} type="button" className={`rfa-pastilla${capa === c ? ' activa' : ''}`} aria-pressed={capa === c} onClick={() => setCapa(c)}>
                {CAPA_LABELS[c]} <span>{porCapa(c)}</span>
              </button>
            ))}
          </div>
          <div className="adm-filtros">
            <div className="adm-buscar">
              <Search size={16} aria-hidden="true" />
              <input className="form-input" type="search" value={texto} onChange={e => setTexto(e.target.value)}
                placeholder="Buscar por título, número u organismo" aria-label="Buscar documento" />
            </div>
            <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value as TipoReferencia | '')} aria-label="Tipo">
              <option value="">Todos los tipos</option>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
            </select>
            <select className="form-select" value={estado} onChange={e => setEstado(e.target.value as EstadoReferencia | '')} aria-label="Estado">
              <option value="">Todos los estados</option>
              {(['publicada', 'borrador', 'no_vigente'] as EstadoReferencia[]).map(s => <option key={s} value={s}>{ESTADO_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
      )}

      {!cargando && docs.length > 0 && hayFiltro && filtrados.length === 0 && (
        <EstadoVacio compacto icono={Search} titulo="Ningún documento coincide con los filtros"
          texto="Probá con otra palabra o sacá algún filtro."
          accion={{ etiqueta: 'Ver todo', alTocar: limpiarFiltros }} />
      )}

      {CAPAS.map(c => {
        const deCapa = filtrados.filter(d => d.capa === c);
        if (deCapa.length === 0) return null;
        return (
          <section key={c} className="rfa-grupo" aria-labelledby={`rfa-capa-${c}`}>
            <h3 id={`rfa-capa-${c}`} className="rfa-grupo-titulo">
              {CAPA_LABELS[c]} <span>{deCapa.length}</span>
            </h3>
            <ul className="rfa-lista">
              {deCapa.map(d => <li key={d.id}><TarjetaDoc doc={d} alAbrir={() => abrir(d.id)} /></li>)}
            </ul>
          </section>
        );
      })}

      {editor && (
        <EditorReferencia key={editor.clave} id={editor.id} sugerenciasAreas={sugerenciasAreas}
          alCerrar={() => setEditor(null)} alCambiar={recargar} />
      )}
    </div>
  );
}

function TarjetaDoc({ doc, alAbrir }: { doc: Referencia; alAbrir: () => void }) {
  const est = estadoDe(doc);
  const n = doc.cantidadFragmentos ?? 0;
  return (
    <button type="button" className="card card-interactive rfa-doc" onClick={alAbrir}>
      <span className="rfa-doc-arriba">
        <span className={`badge ${ESTADO_BADGE[est]}`}>{ESTADO_LABELS[est]}</span>
        <span className="badge badge-neutral">{TIPO_LABELS[doc.tipo]}</span>
        {doc.audiencia === 'comunidad' && <span className="badge badge-cyan"><Users size={12} aria-hidden="true" /> Comunidad</span>}
      </span>
      <strong className="rfa-doc-titulo">{doc.titulo}</strong>
      <span className="rfa-doc-meta">
        {[doc.numero, doc.organismo, fechaLarga(doc.fecha)].filter(Boolean).join(' · ') || 'Sin número de norma'}
      </span>
      <span className="rfa-doc-chips">
        {doc.areas.slice(0, 3).map(a => <span key={a} className="rfa-chip">{a}</span>)}
        {doc.areas.length > 3 && <span className="rfa-chip">+{doc.areas.length - 3}</span>}
        {doc.areas.length === 0 && <span className="rfa-chip rfa-chip-suave">Todas las áreas</span>}
        <span className="rfa-chip rfa-chip-suave">{etiquetaAnios(doc.anios)}</span>
      </span>
      <span className={`rfa-doc-frag${n === 0 ? ' vacio' : ''}`}>
        <FileText size={13} aria-hidden="true" /> {n === 0 ? 'Sin fragmentos todavía' : `${n} fragmento${n !== 1 ? 's' : ''}`}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Editor
// ═══════════════════════════════════════════════════════════════════

interface Meta {
  capa: CapaReferencia;
  tipo: TipoReferencia;
  titulo: string;
  numero: string;
  organismo: string;
  fecha: string;
  fuenteUrl: string;
  areas: string[];
  anios: number[];
  audiencia: AudienciaReferencia;
  resumen: string;
}

interface FragEdit {
  clave: string;
  id: string | null;
  seccion: string;
  texto: string;
}

const META_VACIA: Meta = {
  capa: 'nacional', tipo: 'ley', titulo: '', numero: '', organismo: '', fecha: '',
  fuenteUrl: '', areas: [], anios: [], audiencia: 'equipo', resumen: '',
};

const metaDe = (r: Referencia): Meta => ({
  capa: r.capa, tipo: r.tipo, titulo: r.titulo, numero: r.numero ?? '', organismo: r.organismo ?? '',
  fecha: r.fecha ?? '', fuenteUrl: r.fuenteUrl ?? '', areas: r.areas, anios: r.anios,
  audiencia: r.audiencia, resumen: r.resumen ?? '',
});

const foto = (meta: Meta, frags: FragEdit[]) =>
  JSON.stringify({ meta, frags: frags.map(f => [f.id, f.seccion.trim(), f.texto.trim()]) });

/** Cuántos fragmentos se muestran de entrada (un NAP puede traer cientos). */
const POR_TANDA = 40;

function EditorReferencia({ id: idInicial, sugerenciasAreas, alCerrar, alCambiar }: {
  id: string | null;
  sugerenciasAreas: string[];
  alCerrar: () => void;
  alCambiar: () => void;
}) {
  const [id, setId] = useState<string | null>(idInicial);
  const [doc, setDoc] = useState<Referencia | null>(null);
  const [cargando, setCargando] = useState(Boolean(idInicial));
  const [errorCarga, setErrorCarga] = useState('');
  const [meta, setMeta] = useState<Meta>(META_VACIA);
  const [frags, setFrags] = useState<FragEdit[]>([]);
  const [guardado, setGuardado] = useState(() => foto(META_VACIA, []));
  const [fuente, setFuente] = useState('');
  const [leyendo, setLeyendo] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [visibles, setVisibles] = useState(POR_TANDA);
  const textareas = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    if (!idInicial) return;
    let cancelado = false;
    obtenerReferencia(idInicial)
      .then(r => {
        if (cancelado) return;
        if (!r) { setErrorCarga('Este documento ya no existe.'); return; }
        const m = metaDe(r.referencia);
        const f = r.fragmentos.map(x => ({ clave: nuevaClave(), id: x.id, seccion: x.seccion ?? '', texto: x.texto }));
        setDoc(r.referencia);
        setMeta(m);
        setFrags(f);
        setGuardado(foto(m, f));
      })
      .catch(err => { if (!cancelado) setErrorCarga(err instanceof Error ? err.message : 'No se pudo abrir el documento.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [idInicial]);

  const sucio = foto(meta, frags) !== guardado;
  const est = doc ? estadoDe(doc) : null;
  const esNap = meta.tipo === 'nap';
  const cambiarMeta = <K extends keyof Meta>(k: K, v: Meta[K]) => setMeta(m => ({ ...m, [k]: v }));

  const pedirCierre = async () => {
    if (ocupado) return;
    if (sucio && !(await confirmar({
      titulo: '¿Cerrar sin guardar?',
      mensaje: 'Los cambios en este documento se pierden.',
      accion: 'Descartar cambios',
      cancelar: 'Seguir editando',
      peligro: true,
    }))) return;
    alCerrar();
  };

  // ── Contenido ──

  const leerArchivo = async (file: File) => {
    const nombre = file.name.toLowerCase();
    if (file.size > 25 * 1024 * 1024) { avisar.error('El archivo pesa más de 25 MB.', 'Partilo en partes más chicas o pegá el texto.'); return; }
    setLeyendo(file.name);
    try {
      let texto: string;
      if (/\.(txt|md|markdown)$/.test(nombre) || file.type.startsWith('text/')) texto = (await file.text()).trim();
      else if (/\.pdf$/.test(nombre) || file.type === 'application/pdf') texto = await leerTextoDeArchivo(file, 'pdf', meta.titulo || file.name);
      else if (/\.docx?$/.test(nombre)) texto = await leerTextoDeArchivo(file, 'doc');
      else throw new Error('Ese tipo de archivo no se puede leer. Subí un PDF, un Word (.docx) o un .txt.');
      if (!texto) throw new Error('El archivo no tiene texto.');
      setFuente(texto);
      avisar.exito('Texto leído', 'Revisalo y tocá «Partir en fragmentos».');
    } catch (err) {
      avisar.error(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setLeyendo('');
    }
  };

  const partir = async () => {
    const nuevos = fragmentar(fuente, { tipo: meta.tipo, areas: meta.areas, anios: meta.anios });
    if (nuevos.length === 0) { avisar.error('No quedó ningún fragmento: el texto parece vacío.'); return; }
    if (frags.length > 0) {
      const conVinculos = doc?.publicada && frags.some(f => f.id);
      const ok = await confirmar({
        titulo: `¿Reemplazar los ${frags.length} fragmentos actuales?`,
        mensaje: `Quedan ${nuevos.length} fragmentos nuevos. Hasta que guardes no cambia nada.${conVinculos ? ' Este documento está publicado: si algún docente vinculó fragmentos a su planificación, al guardar se pierden esos vínculos.' : ''}`,
        accion: 'Reemplazar',
      });
      if (!ok) return;
    }
    setFrags(nuevos.map(f => ({ clave: nuevaClave(), id: null, seccion: f.seccion ?? '', texto: f.texto })));
    setVisibles(POR_TANDA);
    avisar.info(`Quedaron ${nuevos.length} fragmento${nuevos.length !== 1 ? 's' : ''}`, 'Revisá secciones y cortes antes de guardar.');
  };

  // ── Fragmentos ──

  const cambiarFrag = (clave: string, cambios: Partial<FragEdit>) =>
    setFrags(fs => fs.map(f => (f.clave === clave ? { ...f, ...cambios } : f)));

  const mover = (i: number, d: -1 | 1) => setFrags(fs => {
    const j = i + d;
    if (j < 0 || j >= fs.length) return fs;
    const copia = [...fs];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  const unir = (i: number) => {
    const a = frags[i];
    const b = frags[i + 1];
    if (!a || !b) return;
    const texto = `${a.texto.trim()}\n\n${b.texto.trim()}`;
    if (texto.length > MAX_TEXTO_FRAGMENTO) {
      avisar.error(`Juntos pasan de ${MAX_TEXTO_FRAGMENTO.toLocaleString('es-AR')} caracteres.`, 'Acortá alguno antes de unirlos.');
      return;
    }
    setFrags(fs => [...fs.slice(0, i), { ...a, seccion: a.seccion.trim() || b.seccion, texto }, ...fs.slice(i + 2)]);
  };

  const partirFrag = (i: number) => {
    const f = frags[i];
    const cursor = textareas.current.get(f.clave)?.selectionStart ?? 0;
    let partes: [string, string] | null = null;
    if (cursor > 0 && cursor < f.texto.length - 1) {
      const a = f.texto.slice(0, cursor).trim();
      const b = f.texto.slice(cursor).trim();
      if (a && b) partes = [a, b];
    }
    partes ??= partirEnDos(f.texto);
    if (!partes) { avisar.info('Es una sola oración', 'Poné el cursor donde querés cortarlo y volvé a tocar «Partir».'); return; }
    const [a, b] = partes;
    setFrags(fs => [...fs.slice(0, i), { ...f, texto: a }, { clave: nuevaClave(), id: null, seccion: f.seccion, texto: b }, ...fs.slice(i + 1)]);
  };

  const quitar = (i: number) => setFrags(fs => fs.filter((_, j) => j !== i));

  const agregar = () => {
    const ultimo = frags[frags.length - 1];
    setFrags(fs => [...fs, { clave: nuevaClave(), id: null, seccion: ultimo?.seccion ?? '', texto: '' }]);
    setVisibles(v => Math.max(v, frags.length + 1));
  };

  // ── Guardar y estado ──

  const validar = (): string | null => {
    const titulo = meta.titulo.trim();
    if (titulo.length < 3 || titulo.length > 300) return 'El título tiene que tener entre 3 y 300 caracteres.';
    if (meta.fuenteUrl.trim() && !/^https?:\/\//i.test(meta.fuenteUrl.trim())) return 'El enlace oficial tiene que empezar con http:// o https://.';
    if (esNap && (meta.areas.length === 0 || meta.anios.length === 0)) {
      return 'Los NAP necesitan áreas y años: así a cada docente le aparecen los de su materia y curso.';
    }
    const vacio = frags.findIndex(f => !f.texto.trim());
    if (vacio >= 0) return `El fragmento ${vacio + 1} está vacío: escribile texto o borralo.`;
    const largo = frags.findIndex(f => f.texto.trim().length > MAX_TEXTO_FRAGMENTO);
    if (largo >= 0) return `El fragmento ${largo + 1} pasa de ${MAX_TEXTO_FRAGMENTO.toLocaleString('es-AR')} caracteres: partilo.`;
    return null;
  };

  const guardar = async () => {
    const problema = validar();
    if (problema) { avisar.error(problema); return; }

    if (doc?.publicada) {
      const quedan = new Set(frags.map(f => f.id).filter(Boolean));
      const salen = guardadoIds(guardado).filter(x => !quedan.has(x)).length;
      if (salen > 0 && !(await confirmar({
        titulo: `¿Quitar ${salen} fragmento${salen !== 1 ? 's' : ''} de un documento publicado?`,
        mensaje: 'La IA deja de citarlos al guardar. Si algún docente los vinculó a un tema de su planificación, ese vínculo se pierde.',
        accion: 'Guardar igual',
      }))) return;
    }

    setOcupado('guardar');
    const datos = {
      capa: meta.capa, tipo: meta.tipo, titulo: meta.titulo, numero: meta.numero, organismo: meta.organismo,
      fecha: meta.fecha, fuenteUrl: meta.fuenteUrl, areas: meta.areas, anios: meta.anios,
      audiencia: meta.audiencia, resumen: meta.resumen,
    };
    let docId = id;
    try {
      const r = docId ? await actualizarReferencia(docId, datos) : await crearReferencia(datos);
      docId = r.id;
      setId(r.id);
      setDoc(r);
      const quedaron = await guardarFragmentos(r.id, frags.map(f => ({ id: f.id, seccion: f.seccion, texto: f.texto })));
      const m = metaDe(r);
      const f = quedaron.map(x => ({ clave: nuevaClave(), id: x.id, seccion: x.seccion ?? '', texto: x.texto }));
      setMeta(m);
      setFrags(f);
      setGuardado(foto(m, f));
      setDoc({ ...r, cantidadFragmentos: f.length });
      avisar.exito(r.publicada ? 'Cambios guardados' : 'Guardado como borrador',
        r.publicada ? 'La IA ya usa la versión nueva.' : 'La IA todavía no lo usa: publicalo cuando esté revisado.');
      alCambiar();
    } catch (err) {
      avisar.error(err instanceof Error ? err.message : 'No se pudo guardar.');
      // Si el documento se creó pero fallaron los fragmentos, queda abierto para reintentar
      if (docId && !id) alCambiar();
    } finally {
      setOcupado('');
    }
  };

  const accion = async (nombre: string, hacer: () => Promise<Referencia>, exito: string) => {
    setOcupado(nombre);
    try {
      const r = await hacer();
      setDoc(d => ({ ...r, cantidadFragmentos: d?.cantidadFragmentos ?? frags.length }));
      avisar.exito(exito);
      alCambiar();
    } catch (err) {
      avisar.error(err instanceof Error ? err.message : 'No se pudo hacer el cambio.');
    } finally {
      setOcupado('');
    }
  };

  const publicar = async () => {
    if (!doc) return;
    const ok = await confirmar({
      titulo: `¿Publicar «${doc.titulo}»?`,
      mensaje: `Desde ahora la IA del Laboratorio, Crear y Migue lo va a consultar y citar en todas las escuelas municipales. ${doc.audiencia === 'comunidad' ? 'También lo van a ver estudiantes y familias.' : 'Lo ven docentes y dirección; estudiantes y familias, no.'}`,
      accion: 'Publicar',
    });
    if (ok) await accion('publicar', () => publicarReferencia(doc.id, true), 'Publicado: la IA ya lo puede citar');
  };

  const despublicar = async () => {
    if (!doc) return;
    const ok = await confirmar({
      titulo: '¿Volver a borrador?',
      mensaje: 'La IA deja de consultarlo y citarlo hasta que lo publiques de nuevo.',
      accion: 'Despublicar',
    });
    if (ok) await accion('despublicar', () => publicarReferencia(doc.id, false), 'Volvió a borrador');
  };

  const cambiarVigencia = async (vigente: boolean) => {
    if (!doc) return;
    const ok = await confirmar(vigente
      ? { titulo: '¿Marcar como vigente?', mensaje: doc.publicada ? 'Está publicado: la IA lo vuelve a citar.' : 'Sigue como borrador hasta que lo publiques.', accion: 'Marcar vigente' }
      : { titulo: '¿Marcar como no vigente?', mensaje: 'Para una norma derogada o reemplazada: la IA deja de citarla, pero queda en la biblioteca como historial.', accion: 'Marcar no vigente' });
    if (ok) await accion('vigencia', () => marcarVigencia(doc.id, vigente), vigente ? 'Marcado como vigente' : 'Marcado como no vigente');
  };

  const borrar = async () => {
    if (!doc) return;
    const ok = await confirmar({
      titulo: `¿Borrar «${doc.titulo}»?`,
      mensaje: 'Se borran el documento y todos sus fragmentos, y los vínculos de NAP de las planificaciones. No se puede deshacer. Si la norma fue derogada, mejor marcala como no vigente.',
      accion: 'Borrar',
      peligro: true,
    });
    if (!ok) return;
    setOcupado('borrar');
    try {
      await borrarReferencia(doc.id);
      avisar.exito('Documento borrado');
      alCambiar();
      alCerrar();
    } catch (err) {
      avisar.error(err instanceof Error ? err.message : 'No se pudo borrar.');
      setOcupado('');
    }
  };

  const titulo = id ? (doc?.titulo || 'Documento') : 'Agregar documento';
  const fragsVisibles = frags.slice(0, visibles);

  return (
    <Dialogo abierto alCerrar={alCerrar} alPedirCierre={() => { void pedirCierre(); }}
      etiquetadoPor="rfa-editor-titulo" className="adm-dialogo rfa-dialogo">
      <div className="dialogo-encabezado">
        <h2 id="rfa-editor-titulo" className="rfa-editor-titulo">{titulo}</h2>
        <button type="button" className="btn-icon" onClick={() => { void pedirCierre(); }} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="dialogo-bajada">
        {id ? 'Datos, fragmentos y estado. Lo publicado lo consulta y cita la IA en todas las escuelas.' : 'Cargalo desde su fuente oficial. Se guarda como borrador: la IA lo usa recién cuando lo publiques.'}
      </p>

      <div className="adm-dialogo-contenido">
        {cargando && <Esqueleto tipo="filas" cantidad={3} etiqueta="Abriendo el documento…" />}
        {errorCarga && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {errorCarga}</div>}

        {!cargando && !errorCarga && (
          <>
            {doc && est && (
              <section className={`rfa-estado rfa-estado-${est}`} aria-label="Estado del documento">
                <div className="rfa-estado-texto">
                  <span className={`badge ${ESTADO_BADGE[est]}`}>{ESTADO_LABELS[est]}</span>
                  <span>
                    {est === 'publicada' && `La IA lo consulta y lo cita. Lo ven ${doc.audiencia === 'comunidad' ? 'también estudiantes y familias' : 'docentes y dirección'}.`}
                    {est === 'borrador' && 'La IA todavía no lo usa.'}
                    {est === 'no_vigente' && 'Derogado o reemplazado: la IA no lo cita. Queda como historial.'}
                  </span>
                </div>
                <div className="rfa-estado-acciones">
                  {est === 'borrador' && (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => { void publicar(); }}
                      disabled={Boolean(ocupado) || sucio || frags.length === 0}>
                      <Send size={15} aria-hidden="true" /> {ocupado === 'publicar' ? 'Publicando…' : 'Publicar'}
                    </button>
                  )}
                  {doc.publicada && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { void despublicar(); }} disabled={Boolean(ocupado)}>
                      <EyeOff size={15} aria-hidden="true" /> Despublicar
                    </button>
                  )}
                  {doc.vigente ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void cambiarVigencia(false); }} disabled={Boolean(ocupado)}>
                      <Ban size={15} aria-hidden="true" /> Marcar no vigente
                    </button>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { void cambiarVigencia(true); }} disabled={Boolean(ocupado)}>
                      <RotateCcw size={15} aria-hidden="true" /> Volver a vigente
                    </button>
                  )}
                  <button type="button" className="btn btn-peligro btn-sm" onClick={() => { void borrar(); }} disabled={Boolean(ocupado)}>
                    <Trash2 size={15} aria-hidden="true" /> {ocupado === 'borrar' ? 'Borrando…' : 'Borrar'}
                  </button>
                </div>
                {est === 'borrador' && (sucio || frags.length === 0) && (
                  <p className="rfa-nota">{sucio ? 'Guardá los cambios antes de publicar.' : 'Para publicar hace falta al menos un fragmento.'}</p>
                )}
              </section>
            )}

            <DatosDocumento meta={meta} cambiar={cambiarMeta} sugerenciasAreas={sugerenciasAreas} />

            <section className="rfa-bloque" aria-labelledby="rfa-contenido-titulo">
              <h3 id="rfa-contenido-titulo" className="adm-subtitulo"><FileText size={17} aria-hidden="true" /> Contenido</h3>
              <details className="rfa-fuente" open={frags.length === 0}>
                <summary>{frags.length === 0 ? 'Subí el archivo o pegá el texto' : 'Volver a cargar el contenido (reemplaza los fragmentos)'}</summary>
                <div className="rfa-fuente-cuerpo">
                  <label className="rfa-archivo">
                    <Upload size={22} aria-hidden="true" />
                    <strong>{leyendo ? `Leyendo ${leyendo}…` : 'Subir PDF, Word o .txt'}</strong>
                    <span>Word, .txt y PDF con texto se leen en el navegador, sin gastar IA. Un PDF escaneado (fotos de páginas) lo transcribe la IA: usa cupo de IA del día y puede tardar unos minutos.</span>
                    <input type="file" accept=".pdf,.docx,.doc,.txt,.md,application/pdf,text/plain"
                      disabled={Boolean(leyendo)}
                      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leerArchivo(f); }} />
                  </label>
                  {leyendo && <Cargando texto="Leyendo el archivo… dejá esta pestaña abierta." />}
                  <Campo label="Texto del documento" htmlFor="rfa-fuente"
                    ayuda="Revisalo antes de partir: sacá índices, carátulas o notas que no son parte de la norma.">
                    <textarea id="rfa-fuente" className="form-textarea rfa-fuente-texto" rows={8} value={fuente}
                      onChange={e => setFuente(e.target.value)} placeholder="O pegá acá el texto copiado de la fuente oficial" />
                  </Campo>
                  <div className="rfa-fuente-acciones">
                    <span className="rfa-nota">
                      {esNap
                        ? 'NAP: cada ítem queda como un fragmento, con área, año y eje en la sección.'
                        : `Se respetan títulos, artículos y secciones; ningún fragmento pasa de unos ${MAX_FRAGMENTO.toLocaleString('es-AR')} caracteres.`}
                    </span>
                    <button type="button" className="btn btn-primary" onClick={() => { void partir(); }} disabled={!fuente.trim() || Boolean(leyendo)}>
                      <Scissors size={16} aria-hidden="true" /> Partir en fragmentos
                    </button>
                  </div>
                </div>
              </details>
            </section>

            <section className="rfa-bloque" aria-labelledby="rfa-frag-titulo">
              <div className="rfa-frag-cabecera">
                <h3 id="rfa-frag-titulo" className="adm-subtitulo">Fragmentos <span className="rfa-cuenta">{frags.length}</span></h3>
                <p className="rfa-nota">
                  Cada fragmento es lo que la IA encuentra y cita: que se entienda solo (un artículo, un NAP, una sección).
                  La sección dice de dónde sale.
                </p>
              </div>
              {frags.length === 0 ? (
                <EstadoVacio compacto icono={FileText} titulo="Todavía no hay fragmentos"
                  texto="Partí el texto del documento o agregalos a mano."
                  accion={{ etiqueta: 'Agregar fragmento', icono: Plus, alTocar: agregar }} />
              ) : (
                <>
                  <ol className="rfa-frags">
                    {fragsVisibles.map((f, i) => {
                      const largo = f.texto.trim().length;
                      const nivel = largo > MAX_TEXTO_FRAGMENTO ? 'error' : largo > MAX_FRAGMENTO ? 'aviso' : '';
                      const n = i + 1;
                      return (
                        <li key={f.clave} className="rfa-frag">
                          <div className="rfa-frag-fila">
                            <span className="rfa-frag-num" aria-hidden="true">{n}</span>
                            <input className="form-input rfa-frag-seccion" value={f.seccion}
                              onChange={e => cambiarFrag(f.clave, { seccion: e.target.value })}
                              placeholder="Sección (ej: Capítulo II · Artículo 5)" aria-label={`Sección del fragmento ${n}`} maxLength={300} />
                          </div>
                          <textarea className="form-textarea rfa-frag-texto" value={f.texto}
                            ref={el => { if (el) textareas.current.set(f.clave, el); else textareas.current.delete(f.clave); }}
                            rows={Math.min(12, Math.max(3, Math.ceil(f.texto.length / 80)))}
                            onChange={e => cambiarFrag(f.clave, { texto: e.target.value })}
                            aria-label={`Texto del fragmento ${n}`} />
                          <div className="rfa-frag-pie">
                            <span className={`rfa-largo ${nivel}`}>
                              {largo.toLocaleString('es-AR')} caracteres
                              {nivel === 'aviso' && ' · largo: conviene partirlo'}
                              {nivel === 'error' && ` · pasa el máximo (${MAX_TEXTO_FRAGMENTO.toLocaleString('es-AR')})`}
                            </span>
                            <div className="rfa-frag-acciones">
                              <button type="button" className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0}
                                aria-label={`Subir fragmento ${n}`} title="Subir"><ChevronUp size={17} aria-hidden="true" /></button>
                              <button type="button" className="btn-icon" onClick={() => mover(i, 1)} disabled={i === frags.length - 1}
                                aria-label={`Bajar fragmento ${n}`} title="Bajar"><ChevronDown size={17} aria-hidden="true" /></button>
                              <button type="button" className="btn-icon" onClick={() => unir(i)} disabled={i === frags.length - 1}
                                aria-label={`Unir fragmento ${n} con el siguiente`} title="Unir con el siguiente"><Merge size={17} aria-hidden="true" /></button>
                              <button type="button" className="btn-icon" onClick={() => partirFrag(i)}
                                aria-label={`Partir fragmento ${n} donde está el cursor`} title="Partir donde está el cursor (o a la mitad)"><Scissors size={17} aria-hidden="true" /></button>
                              <button type="button" className="btn-icon rfa-quitar" onClick={() => quitar(i)}
                                aria-label={`Borrar fragmento ${n}`} title="Borrar"><Trash2 size={17} aria-hidden="true" /></button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="rfa-frag-mas">
                    {frags.length > visibles && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setVisibles(v => v + POR_TANDA)}>
                        Mostrar {Math.min(POR_TANDA, frags.length - visibles)} más (quedan {frags.length - visibles})
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={agregar}>
                      <Plus size={15} aria-hidden="true" /> Agregar fragmento
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <div className="adm-dialogo-pie rfa-pie">
        {sucio && !cargando && <span className="rfa-sin-guardar" role="status">Cambios sin guardar</span>}
        <button type="button" className="btn btn-ghost" onClick={() => { void pedirCierre(); }} disabled={ocupado === 'guardar'}>
          {sucio ? 'Cancelar' : 'Cerrar'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => { void guardar(); }}
          disabled={cargando || Boolean(errorCarga) || Boolean(ocupado) || (Boolean(id) && !sucio)}>
          {ocupado === 'guardar' ? 'Guardando…' : doc?.publicada ? 'Guardar cambios' : 'Guardar borrador'}
        </button>
      </div>
    </Dialogo>
  );
}

/** Los ids de fragmento de la última versión guardada (para avisar qué se quita). */
function guardadoIds(fotoGuardada: string): string[] {
  try {
    const { frags } = JSON.parse(fotoGuardada) as { frags: [string | null, string, string][] };
    return frags.map(f => f[0]).filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

// ── Datos del documento ──

function DatosDocumento({ meta, cambiar, sugerenciasAreas }: {
  meta: Meta;
  cambiar: <K extends keyof Meta>(k: K, v: Meta[K]) => void;
  sugerenciasAreas: string[];
}) {
  const esNap = meta.tipo === 'nap';
  const esEsi = meta.tipo === 'esi';
  const aniosOpciones = meta.anios.includes(7) ? [...ANIOS_BASE, 7] : ANIOS_BASE;

  const cambiarCapa = (c: CapaReferencia) => {
    cambiar('capa', c);
    // Las técnicas casi siempre son de tipo técnica
    if (c === 'tecnica' && (meta.tipo === 'ley' || meta.tipo === 'otro')) cambiar('tipo', 'tecnica');
  };

  const alternarAnio = (a: number) =>
    cambiar('anios', meta.anios.includes(a) ? meta.anios.filter(x => x !== a) : [...meta.anios, a].sort((x, y) => x - y));

  return (
    <section className="rfa-bloque" aria-labelledby="rfa-datos-titulo">
      <h3 id="rfa-datos-titulo" className="adm-subtitulo"><Library size={17} aria-hidden="true" /> Datos del documento</h3>
      <div className="adm-fila">
        <Campo label="Capa" htmlFor="rfa-capa">
          <select id="rfa-capa" className="form-select" value={meta.capa} onChange={e => cambiarCapa(e.target.value as CapaReferencia)}>
            {CAPAS.map(c => <option key={c} value={c}>{CAPA_LABELS[c]}</option>)}
          </select>
        </Campo>
        <Campo label="Tipo" htmlFor="rfa-tipo">
          <select id="rfa-tipo" className="form-select" value={meta.tipo} onChange={e => cambiar('tipo', e.target.value as TipoReferencia)}>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
          </select>
        </Campo>
      </div>

      {esNap && (
        <div className="adm-aviso rfa-guia" role="note">
          <Info size={15} aria-hidden="true" />
          <span>
            <strong>NAP:</strong> cargá áreas y años (son obligatorios). Así la IA y la planificación le ofrecen a cada
            docente los NAP de su materia y curso, y cada ítem queda como un fragmento que se puede vincular a un tema.
          </span>
        </div>
      )}
      {esEsi && (
        <div className={`adm-aviso rfa-guia${meta.audiencia === 'comunidad' ? '' : ' rfa-guia-info'}`} role="note">
          <Info size={15} aria-hidden="true" />
          <span>
            <strong>ESI:</strong> sugerimos audiencia «Equipo». Elegí «Comunidad» solo si el material está pensado para
            estudiantes o familias; los lineamientos, protocolos y orientaciones para docentes son del equipo.
          </span>
        </div>
      )}

      <Campo label="Título" htmlFor="rfa-titulo">
        <input id="rfa-titulo" className="form-input" data-inicial value={meta.titulo} maxLength={300}
          onChange={e => cambiar('titulo', e.target.value)} placeholder="El nombre oficial del documento" />
      </Campo>
      <div className="adm-fila">
        <Campo label="Número" htmlFor="rfa-numero" ayuda="Es lo que la IA cita. Como figura en la norma.">
          <input id="rfa-numero" className="form-input" value={meta.numero} maxLength={120}
            onChange={e => cambiar('numero', e.target.value)} placeholder="Ej: Ley 26.150" />
        </Campo>
        <Campo label="Organismo" htmlFor="rfa-organismo">
          <input id="rfa-organismo" className="form-input" value={meta.organismo} maxLength={200}
            onChange={e => cambiar('organismo', e.target.value)} placeholder="Quién la dictó" />
        </Campo>
      </div>
      <div className="adm-fila">
        <Campo label="Fecha" htmlFor="rfa-fecha">
          <input id="rfa-fecha" className="form-input" type="date" value={meta.fecha} onChange={e => cambiar('fecha', e.target.value)} />
        </Campo>
        <Campo label="Enlace oficial" htmlFor="rfa-url" ayuda={meta.fuenteUrl && /^https?:\/\//i.test(meta.fuenteUrl.trim())
          ? <a href={meta.fuenteUrl.trim()} target="_blank" rel="noopener noreferrer" className="rfa-enlace">Abrir <ExternalLink size={12} aria-hidden="true" /></a>
          : 'Donde se puede leer la fuente (boletín oficial, sitio del ministerio).'}>
          <input id="rfa-url" className="form-input" type="url" inputMode="url" value={meta.fuenteUrl}
            onChange={e => cambiar('fuenteUrl', e.target.value)} placeholder="https://" />
        </Campo>
      </div>

      <CampoAreas areas={meta.areas} alCambiar={a => cambiar('areas', a)} sugerencias={sugerenciasAreas} obligatorio={esNap} />

      <fieldset className="rfa-anios">
        <legend>Años{esNap ? ' (obligatorio)' : ''}</legend>
        <div className="adm-chips">
          {aniosOpciones.map(a => (
            <button key={a} type="button" className={`rfa-toggle${meta.anios.includes(a) ? ' activo' : ''}`}
              aria-pressed={meta.anios.includes(a)} onClick={() => alternarAnio(a)}>
              {a}°
            </button>
          ))}
        </div>
        <span className="adm-ayuda">{meta.anios.length === 0 ? 'Ninguno marcado = aplica a todos los años.' : etiquetaAnios(meta.anios)}</span>
      </fieldset>

      <fieldset className="rfa-audiencia">
        <legend>Quién lo puede ver</legend>
        {(['equipo', 'comunidad'] as AudienciaReferencia[]).map(a => (
          <label key={a} className={`rfa-opcion${meta.audiencia === a ? ' activa' : ''}`}>
            <input type="radio" name="rfa-audiencia" value={a} checked={meta.audiencia === a} onChange={() => cambiar('audiencia', a)} />
            <span>
              <strong>{a === 'equipo' ? 'Equipo' : 'Comunidad'}</strong>
              <span>{a === 'equipo'
                ? 'Docentes y dirección. Estudiantes y familias no lo ven ni la IA se lo cita a ellos.'
                : 'También estudiantes y familias: la IA se lo puede citar a cualquiera (por ejemplo, Migue).'}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Campo label="Resumen" htmlFor="rfa-resumen" ayuda="En una o dos frases: qué es y para qué sirve. Es lo que se ve en la lista.">
        <textarea id="rfa-resumen" className="form-textarea" rows={2} value={meta.resumen} maxLength={600}
          onChange={e => cambiar('resumen', e.target.value)} />
      </Campo>
    </section>
  );
}

function CampoAreas({ areas, alCambiar, sugerencias, obligatorio }: {
  areas: string[];
  alCambiar: (a: string[]) => void;
  sugerencias: string[];
  obligatorio: boolean;
}) {
  const [texto, setTexto] = useState('');
  const elegidas = new Set(areas.map(normalizar));
  const opciones = sugerencias.filter(s => !elegidas.has(normalizar(s)));

  const agregar = (valor: string) => {
    const a = valor.trim().replace(/,$/, '').trim();
    if (!a) return;
    if (!elegidas.has(normalizar(a))) {
      // Si coincide con una sugerencia, se usa como está escrita ahí
      const igual = sugerencias.find(s => normalizar(s) === normalizar(a));
      alCambiar([...areas, igual ?? a]);
    }
    setTexto('');
  };

  return (
    <div className="adm-campo">
      <label htmlFor="rfa-areas">Áreas{obligatorio ? ' (obligatorio)' : ''}</label>
      {areas.length > 0 && (
        <div className="adm-chips">
          {areas.map(a => (
            <span key={a} className="adm-chip">
              {a}
              <button type="button" onClick={() => alCambiar(areas.filter(x => x !== a))} aria-label={`Quitar ${a}`}>
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="adm-alta">
        <input id="rfa-areas" className="form-input" list="rfa-areas-sugeridas" value={texto} maxLength={80}
          onChange={e => {
            const v = e.target.value;
            if (v.endsWith(',')) agregar(v);
            else setTexto(v);
          }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(texto); } }}
          placeholder="Escribí un área y tocá Enter" />
        <button type="button" className="btn btn-outline" onClick={() => agregar(texto)} disabled={!texto.trim()}>
          <Plus size={15} aria-hidden="true" /> Agregar
        </button>
        <datalist id="rfa-areas-sugeridas">
          {opciones.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>
      <span className="adm-ayuda">Sin áreas = aplica a todas. Las sugerencias son las materias cargadas en las escuelas.</span>
    </div>
  );
}
