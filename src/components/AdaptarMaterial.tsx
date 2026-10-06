/**
 * Adaptar un material de la biblioteca.
 *
 * El docente elige una o más adaptaciones (lectura fácil, paso a paso,
 * glosario, más corto, letra grande) y, si quiere, para quién es, en
 * términos generales. La IA arma una versión nueva, fiel al original, que
 * se ve mientras se escribe; el docente la revisa y la guarda como un
 * material aparte. El original no se toca y la versión nueva NO se comparte
 * sola con los estudiantes: eso se decide después, desde Mis materiales.
 *
 * Nunca se mandan a la IA nombres ni datos de estudiantes: el campo "para
 * quién" pide una descripción general y avisa por qué.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Wand2, Loader2, AlertCircle, CheckCircle, ShieldAlert, RotateCcw, BookmarkPlus } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import MarkdownRenderer from './MarkdownRenderer';
import { avisar, confirmar } from './ui/avisar';
import { pedirIA } from '../services/ia-pedido.service';
import { createMaterial, TAG_LETRA_GRANDE } from '../services/library.service';
import type { LibraryMaterial } from '../types';
import './Modals.css';
import './ui/ui.css';
import './AdaptarMaterial.css';

type Adaptacion = 'facil' | 'pasos' | 'glosario' | 'corto' | 'grande';

const ADAPTACIONES: { id: Adaptacion; etiqueta: string; ayuda: string; tag: string; pedido?: string }[] = [
  {
    id: 'facil', etiqueta: 'Lectura fácil', tag: 'lectura-facil',
    ayuda: 'Oraciones cortas y vocabulario simple.',
    pedido: 'Lectura fácil: oraciones cortas (una idea por oración), vocabulario cotidiano, voz activa y párrafos breves. Si un término técnico es parte del contenido, mantenelo y explicalo con palabras simples la primera vez que aparece.',
  },
  {
    id: 'pasos', etiqueta: 'Paso a paso', tag: 'paso-a-paso',
    ayuda: 'Consignas fragmentadas y numeradas.',
    pedido: 'Paso a paso: fragmentá las consignas y las explicaciones largas en pasos numerados, una acción por paso, en el orden en que hay que hacerlas.',
  },
  {
    id: 'glosario', etiqueta: 'Con glosario', tag: 'glosario',
    ayuda: 'Las palabras difíciles, explicadas.',
    pedido: 'Con glosario: marcá en negrita las palabras difíciles la primera vez que aparecen y agregá al final una sección "## Glosario" con cada una explicada en una oración simple, según el sentido que tiene en este texto.',
  },
  {
    id: 'corto', etiqueta: 'Más corto', tag: 'resumido',
    ayuda: 'Solo lo esencial.',
    pedido: 'Más corto: dejá solo lo esencial (las ideas principales y lo que hace falta para las consignas), sin perder ningún concepto clave. Sacá repeticiones y detalles accesorios.',
  },
  {
    id: 'grande', etiqueta: 'Letra grande e interlineado', tag: TAG_LETRA_GRANDE,
    ayuda: 'Cambia cómo se lee en la plataforma: letra más grande y más espacio entre líneas.',
  },
];

/** Hasta acá se manda el original: más largo, la IA corta o resume de más. */
const MAX_ORIGINAL = 15000;

// Palabras que suelen ser un diagnóstico: en este campo no van
const DIAGNOSTICO = /\b(tea|tdah|tda|dislexi\w*|discalculi\w*|disgrafi\w*|autis\w*|asperger|s[ií]ndrome|down|diagn[oó]stic\w*|cud|certificado|trastorno\w*|discapacidad\w*|retraso)\b/i;
/** Una palabra con mayúscula que no va al principio puede ser un nombre. */
function posibleNombre(texto: string): boolean {
  return texto.split(/\s+/).slice(1).some(p => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}[.,;:)]?$/.test(p));
}

function armarPrompt(material: LibraryMaterial, elegidas: Adaptacion[], paraQuien: string): { prompt: string; recortado: boolean } {
  const original = (material.extractedText ?? '').trim();
  const recortado = original.length > MAX_ORIGINAL;
  const texto = recortado ? original.slice(0, MAX_ORIGINAL) : original;
  const pedidos = ADAPTACIONES.filter(a => elegidas.includes(a.id) && a.pedido).map(a => `- ${a.pedido}`);

  const prompt = [
    `Adaptá el siguiente material${material.subjectName ? ` de ${material.subjectName}` : ''} para estudiantes de secundaria.`,
    '',
    'Adaptaciones pedidas:',
    ...(pedidos.length ? pedidos : ['- Ninguna de redacción: mantené el texto casi igual.']),
    ...(elegidas.includes('grande')
      ?['- Se va a leer con letra grande: usá párrafos cortos y títulos que ayuden a ubicarse.']
      : []),
    ...(paraQuien.trim() ? ['', `Pensalo para: ${paraQuien.trim()}.`] : []),
    '',
    'Reglas:',
    '- Sé fiel al original: mantené los mismos conceptos, datos, fechas, nombres propios del tema y ejemplos. No inventes información ni agregues datos que no estén en el texto.',
    '- Mantené el nivel curricular: simplificá la forma, no lo que tienen que aprender.',
    '- Escribí en español rioplatense (voseo), claro y respetuoso, sin infantilizar.',
    '- No menciones que es una versión adaptada ni para quién es.',
    '- Devolvé solo el material adaptado, en Markdown, empezando con un título (#). Sin comentarios antes ni después.',
    ...(recortado
      ? [`- El original es largo y acá va solo el principio (${MAX_ORIGINAL.toLocaleString('es-AR')} caracteres): adaptá solo esa parte y terminá con la línea "(Sigue en el material original.)".`]
      : []),
    '',
    `Título del material: ${material.title}`,
    '--- MATERIAL ORIGINAL ---',
    texto,
    '--- FIN DEL MATERIAL ---',
  ].join('\n');
  return { prompt, recortado };
}

interface Props {
  material: LibraryMaterial;
  teacherId: string;
  /** Curso de la materia, para darle contexto a la IA (sin datos de estudiantes). */
  courseName?: string;
  alCerrar: () => void;
  /** Se llama con el material nuevo, ya guardado. */
  alGuardar?: (nuevo: LibraryMaterial) => void;
}

export default function AdaptarMaterial({ material, teacherId, courseName = '', alCerrar, alGuardar }: Props) {
  const [elegidas, setElegidas] = useState<Set<Adaptacion>>(new Set(['facil']));
  const [paraQuien, setParaQuien] = useState('');
  const [resultado, setResultado] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [recortado, setRecortado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<LibraryMaterial | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Si se cierra mientras escribe, se corta el pedido
  useEffect(() => () => abortRef.current?.abort(), []);

  const lista = ADAPTACIONES.filter(a => elegidas.has(a.id));
  const soloLetraGrande = lista.length === 1 && lista[0].id === 'grande';
  const sinGuardar = !guardado && (generando || resultado.trim().length > 0);

  const alternar = (id: Adaptacion) => {
    setElegidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cerrar = async () => {
    if (sinGuardar && !(await confirmar({
      titulo: generando ? '¿Cortar la adaptación?' : '¿Descartar la versión adaptada?',
      mensaje: generando
        ? 'La IA está escribiendo. Si salís ahora, se corta y no se guarda nada.'
        : 'Todavía no la guardaste. Si salís, se pierde (el material original no cambia).',
      accion: 'Descartar',
      cancelar: 'Seguir acá',
      peligro: true,
    }))) return;
    abortRef.current?.abort();
    alCerrar();
  };

  const generar = async () => {
    if (lista.length === 0 || generando) return;
    const quien = soloLetraGrande ? '' : paraQuien.trim();
    if (quien && (DIAGNOSTICO.test(quien) || posibleNombre(quien)) && !(await confirmar({
      titulo: '¿Escribiste un nombre o un diagnóstico?',
      mensaje: 'Lo que pusiste en "¿Para quién es?" se manda a la IA. Con una descripción general alcanza, por ejemplo "un estudiante con dificultades de lectura". Si hay un nombre o un diagnóstico, corregilo antes de seguir.',
      accion: 'Está bien así, seguir',
      cancelar: 'Corregirlo',
    }))) return;

    setError('');
    setResultado('');
    setGuardado(null);

    // Solo letra grande: no hace falta IA, es el mismo texto con otra lectura
    if (soloLetraGrande) {
      setRecortado(false);
      setResultado((material.extractedText ?? '').trim());
      return;
    }

    const { prompt, recortado: corto } = armarPrompt(material, lista.map(a => a.id), quien);
    setRecortado(corto);
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerando(true);
    try {
      const texto = await pedirIA({
        teacherId,
        sesion: 'Adaptaciones',
        prompt,
        tool: 'free',
        contexto: { subjectName: material.subjectName, courseName },
        alAvanzar: t => { if (!controller.signal.aborted) setResultado(t); },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResultado(texto);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'La IA no respondió. Probá de nuevo.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGenerando(false);
    }
  };

  const guardar = async () => {
    if (!resultado.trim() || guardando || guardado) return;
    setGuardando(true);
    setError('');
    try {
      const nombres = lista.map(a => a.etiqueta).join(', ');
      const nuevo = await createMaterial({
        title: `Versión adaptada: ${material.title} (${nombres})`.slice(0, 150),
        description: `Adaptación de "${material.title}": ${nombres}.`,
        fileType: 'doc',
        fileName: '',
        fileSize: '—',
        subjectId: material.subjectId,
        subjectName: material.subjectName,
        unitName: material.unitName,
        teacherId,
        schoolId: material.schoolId,
        tags: ['adaptado', ...lista.map(a => a.tag)],
        extractedText: resultado.trim(),
      });
      setGuardado(nuevo);
      alGuardar?.(nuevo);
      avisar.exito('Versión adaptada guardada en Mis materiales', 'No se compartió con estudiantes: si querés, compartila desde ahí.');
    } catch (err) {
      console.error('Error guardando la adaptación:', err);
      setError('No se pudo guardar la versión adaptada. Revisá la conexión y probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto alCerrar={alCerrar} alPedirCierre={() => { void cerrar(); }} etiquetadoPor="am-titulo" className="dialogo-em">
      <div className="em-modal em-modal-lg am-modal">
        <div className="em-modal-header">
          <h3 id="am-titulo"><Wand2 size={17} className="text-ia-accent" aria-hidden="true" /> Adaptar material</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={() => { void cerrar(); }}><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="em-modal-body am-cuerpo">
          <p className="am-origen">
            Original: <strong>{material.title}</strong>. No se modifica: la adaptación queda como un material aparte.
          </p>

          {guardado ? (
            <div className="am-listo" role="status">
              <CheckCircle size={28} className="text-success" aria-hidden="true" />
              <h4>Guardada en Mis materiales</h4>
              <p>
                Quedó como <strong>{guardado.title}</strong>. <strong>No se compartió con tus estudiantes</strong>:
                si querés que la vean, tocá "Compartir" en esa tarjeta de Mis materiales.
              </p>
              <button className="btn btn-primary btn-sm" onClick={alCerrar} data-inicial="">Listo</button>
            </div>
          ) : (
            <>
              <fieldset className="am-opciones" disabled={generando}>
                <legend>¿Qué adaptaciones querés? <span className="am-sutil">(una o más)</span></legend>
                {ADAPTACIONES.map((a, i) => (
                  <label key={a.id} className={`am-opcion ${elegidas.has(a.id) ? 'am-elegida' : ''}`}>
                    <input
                      type="checkbox"
                      checked={elegidas.has(a.id)}
                      onChange={() => alternar(a.id)}
                      {...(i === 0 ? { 'data-inicial': '' } : {})}
                    />
                    <span className="am-opcion-textos">
                      <span className="am-opcion-nombre">{a.etiqueta}</span>
                      <span className="am-opcion-ayuda">{a.ayuda}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {!soloLetraGrande && (
                <div className="em-field">
                  <label htmlFor="am-para-quien">¿Para quién es? <span className="am-sutil">(opcional)</span></label>
                  <input
                    id="am-para-quien"
                    type="text"
                    value={paraQuien}
                    maxLength={120}
                    disabled={generando}
                    onChange={e => setParaQuien(e.target.value)}
                    placeholder="Ej: un estudiante con dificultades de lectura"
                    aria-describedby="am-privacidad"
                  />
                  <p id="am-privacidad" className="am-privacidad">
                    <ShieldAlert size={14} aria-hidden="true" />
                    <span>
                      <strong>No escribas nombres ni diagnósticos.</strong> Esto se manda a la IA y son datos de
                      menores: describilo en general ("un grupo que recién empieza con el tema").
                    </span>
                  </p>
                </div>
              )}

              {error && <div className="em-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

              {(generando || resultado) && (
                <section className="am-resultado-bloque" aria-labelledby="am-resultado-titulo">
                  <h4 id="am-resultado-titulo" className="am-resultado-titulo">Versión adaptada</h4>
                  <p className="am-estado" role="status">
                    {generando
                      ? <><Loader2 size={14} className="girando" aria-hidden="true" /> La IA está escribiendo… Revisala antes de guardarla.</>
                      : 'Revisala antes de guardarla: la IA puede equivocarse.'}
                  </p>
                  {recortado && (
                    <p className="am-sutil">
                      El original es largo: se adaptaron los primeros {MAX_ORIGINAL.toLocaleString('es-AR')} caracteres.
                    </p>
                  )}
                  <div className={`am-resultado ${elegidas.has('grande') ? 'am-letra-grande' : ''}`} aria-busy={generando}>
                    {resultado
                      ? <MarkdownRenderer content={resultado} />
                      : <p className="am-sutil">Arrancando…</p>}
                  </div>
                  <details className="am-original">
                    <summary>Ver el original para comparar</summary>
                    <div className="am-original-texto"><MarkdownRenderer content={material.extractedText ?? ''} /></div>
                  </details>
                </section>
              )}
            </>
          )}
        </div>

        {!guardado && (
          <div className="em-modal-footer am-pie">
            <button className="btn btn-outline btn-sm" onClick={() => { void cerrar(); }} disabled={guardando}>Cancelar</button>
            {resultado && !generando ? (
              <>
                <button className="btn btn-outline btn-sm" onClick={generar} disabled={guardando || lista.length === 0}>
                  <RotateCcw size={14} aria-hidden="true" /> {soloLetraGrande ? 'Rehacer' : 'Generar otra vez'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
                  {guardando
                    ? <><Loader2 size={14} className="girando" aria-hidden="true" /> Guardando…</>
                    : <><BookmarkPlus size={14} aria-hidden="true" /> Guardar como material</>}
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={generar} disabled={generando || lista.length === 0}>
                {generando
                  ? <><Loader2 size={14} className="girando" aria-hidden="true" /> Adaptando…</>
                  : <><Wand2 size={14} aria-hidden="true" /> {soloLetraGrande ? 'Preparar versión' : 'Adaptar con IA'}</>}
              </button>
            )}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
