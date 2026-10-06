/**
 * Brief guiado del Laboratorio IA: antes de generar, la herramienta le hace
 * al docente una serie MÍNIMA de preguntas (3-4 campos) para especificar el
 * resultado. Con eso armamos un prompt preciso en lugar de un pedido genérico.
 *
 * El docente siempre puede "Omitir" y escribir libre como antes.
 *
 * El material de la Biblioteca se elige acá mismo (antes había que buscarlo
 * en el panel de la derecha, que en el celular ni se ve). En presentaciones
 * se elige además el enfoque, cuánto texto y el diseño visual.
 */

import { useMemo, useState } from 'react';
import { Wand2, X, Paperclip } from 'lucide-react';
import type { IAToolType, LibraryMaterial } from '../types';
import { DISENOS, DISENO_PREDETERMINADO, disenoDe, varsDiseno, type DisenoId } from '../lib/disenos';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import '../pages/IALab.css';
import './ToolBriefForm.css';

interface Props {
  tool: IAToolType;
  classTitle?: string;
  hasAttachedDoc: boolean;
  /** Materiales de la Biblioteca con texto, para elegir la fuente acá mismo. */
  materiales?: LibraryMaterial[];
  materialId?: string | null;
  alElegirMaterial?: (id: string | null) => void;
  onGenerate: (prompt: string) => void;
  onSkip: () => void;
}

/** Herramientas que pueden partir de un material propio. */
const USAN_MATERIAL: IAToolType[] = ['pres', 'sum', 'act', 'eval'];

const ENFOQUES: { id: string; nombre: string; prompt: string }[] = [
  { id: 'expositiva', nombre: 'Expositiva', prompt: 'Expositiva clásica: introducción, desarrollo por partes y cierre con las ideas clave.' },
  { id: 'visual', nombre: 'Visual', prompt: 'Visual: una sola idea fuerte por diapositiva, frases muy cortas y un ejemplo concreto cuando ayude.' },
  { id: 'caso', nombre: 'Con un caso', prompt: 'Narrativa: un caso o historia cercana (de la vida cotidiana en Argentina) que hile todas las diapositivas.' },
  { id: 'interactiva', nombre: 'Interactiva', prompt: 'Interactiva: cada 2 o 3 diapositivas de contenido, una de "🙋 Pregunta al grupo" con opciones A) B) C) D).' },
  { id: 'repaso', nombre: 'Para repasar', prompt: 'De repaso: esquemas, comparaciones y preguntas para revisar lo que ya se vio, sin contenido nuevo.' },
];

const TEXTOS: { id: string; nombre: string; prompt: string }[] = [
  { id: 'poco', nombre: 'Poco', prompt: '2 o 3 viñetas por diapositiva, de hasta 8 palabras cada una.' },
  { id: 'normal', nombre: 'Normal', prompt: '3 o 4 viñetas breves por diapositiva.' },
  { id: 'mucho', nombre: 'Completo', prompt: '4 o 5 viñetas por diapositiva, cada una con una explicación de una línea.' },
];

const TOOL_TITLES: Partial<Record<IAToolType, string>> = {
  act: 'Generar actividad',
  eval: 'Generar evaluación',
  sum: 'Resumir documento',
  pres: 'Crear presentación',
  oral: 'Evaluar oral',
};

/** Selector simple de opciones excluyentes (pills). */
function PillGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="brief-field">
      <span className="brief-label">{label}</span>
      <div className="brief-pills">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            className={`brief-pill ${value === opt ? 'selected' : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Selector de opciones acumulables (checkbox-pills). */
function MultiPillGroup({ label, options, values, onChange }: {
  label: string; options: string[]; values: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) =>
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  return (
    <div className="brief-field">
      <span className="brief-label">{label} <span className="brief-hint">(tocá para incluir)</span></span>
      <div className="brief-pills">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            className={`brief-pill ${values.includes(opt) ? 'selected' : ''}`}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ToolBriefForm({ tool, classTitle, hasAttachedDoc, materiales = [], materialId = null, alElegirMaterial, onGenerate, onSkip }: Props) {
  // Campos compartidos (cada herramienta usa los suyos)
  const [tema, setTema] = useState(classTitle ?? '');
  const [tipoAct, setTipoAct] = useState('Individual');
  const [duracion, setDuracion] = useState('45 min');
  const [incluirAct, setIncluirAct] = useState<string[]>(['Consignas para el estudiante', 'Desarrollo paso a paso']);

  const [formatoEval, setFormatoEval] = useState('Mixta');
  const [cantPreguntas, setCantPreguntas] = useState('8');
  const [conRubrica, setConRubrica] = useState('Con rúbrica');

  const [estiloSum, setEstiloSum] = useState('Conceptos clave');
  const [extensionSum, setExtensionSum] = useState('Media');

  const [slides, setSlides] = useState('10');
  const [extrasPres, setExtrasPres] = useState<string[]>(['Notas para el docente']);
  const [enfoque, setEnfoque] = useState('expositiva');
  const [texto, setTexto] = useState('normal');
  const [diseno, setDiseno] = useState<DisenoId>(DISENO_PREDETERMINADO);

  const material = materiales.find(m => m.id === materialId) ?? null;

  const [instanciaOral, setInstanciaOral] = useState('Exposición individual');
  const [escalaOral, setEscalaOral] = useState('Numérica 1-10');
  const [focoOral, setFocoOral] = useState('');

  const prompt = useMemo(() => {
    const temaTxt = tema.trim() || material?.title || classTitle || 'el tema de la clase seleccionada';
    // Con material elegido, la IA se apoya en él (llega como documento adjunto)
    const fuente = material
      ? `Basate SOLO en el material adjunto «${material.title}»: no agregues contenido que no esté ahí. Si algo importante del tema no está, decilo en una nota para el docente en vez de inventarlo.`
      : '';
    switch (tool) {
      case 'act':
        return [
          `Generá UNA actividad didáctica sobre "${temaTxt}".`,
          fuente,
          `Modalidad: ${tipoAct.toLowerCase()}. Duración estimada: ${duracion}.`,
          incluirAct.length > 0 ? `Incluí: ${incluirAct.map(s => s.toLowerCase()).join(', ')}.` : '',
          'Formato claro en Markdown, lista para dar en clase. No agregues alternativas ni variantes: una sola actividad bien desarrollada.',
        ].filter(Boolean).join('\n');
      case 'eval':
        return [
          `Creá una evaluación sobre "${temaTxt}".`,
          fuente,
          `Formato: ${formatoEval.toLowerCase()}. Cantidad de consignas: ${cantPreguntas}.`,
          conRubrica === 'Con rúbrica'
            ? 'Incluí rúbrica con criterios de calificación y puntaje por consigna.'
            : 'Incluí el puntaje de cada consigna (sin rúbrica).',
          formatoEval !== 'Desarrollo escrito'
            ? 'En las de opción múltiple: 4 opciones plausibles y marcá la correcta al final.'
            : '',
          'Formato Markdown listo para imprimir o publicar.',
        ].filter(Boolean).join('\n');
      case 'sum':
        return [
          hasAttachedDoc
            ? 'Resumí el material adjunto.'
            : 'Resumí el siguiente texto:\n\n[Pegá tu texto acá]',
          `Estilo: ${estiloSum.toLowerCase()}. Extensión: ${extensionSum.toLowerCase()}.`,
          estiloSum === 'Con glosario' ? 'Cerrá con un glosario de términos clave.' : '',
          estiloSum === 'Con preguntas de comprensión' ? 'Cerrá con 3-5 preguntas de comprensión.' : '',
        ].filter(Boolean).join('\n');
      case 'pres':
        return [
          `Creá una presentación en diapositivas sobre "${temaTxt}".`,
          fuente,
          `Cantidad: ${slides} diapositivas en total, contando la portada.`,
          `Enfoque: ${ENFOQUES.find(e => e.id === enfoque)?.prompt ?? ''}`,
          `Texto: ${TEXTOS.find(t => t.id === texto)?.prompt ?? ''}`,
          extrasPres.includes('Un emoji por diapositiva') ? 'Empezá el título de cada diapositiva con un emoji que la represente.' : '',
          extrasPres.includes('Ejemplos cotidianos') ? 'Usá ejemplos de la vida cotidiana de chicos de secundaria en Argentina.' : '',
          (() => {
            const resto = extrasPres.filter(e => e !== 'Un emoji por diapositiva' && e !== 'Ejemplos cotidianos');
            return resto.length > 0 ? `Incluí además: ${resto.map(s => s.toLowerCase()).join(', ')}.` : '';
          })(),
          `Diseño visual elegido: ${disenoDe(diseno).nombre} (lo aplica la plataforma: escribí solo el contenido, sin indicaciones de colores ni tipografías).`,
        ].filter(Boolean).join('\n');
      case 'oral':
        return [
          `Diseñá una rúbrica para evaluar: ${instanciaOral.toLowerCase()} sobre "${temaTxt}".`,
          `Escala de calificación: ${escalaOral.toLowerCase()}.`,
          focoOral.trim() ? `Poné especial foco en: ${focoOral.trim()}.` : '',
          'Incluí dimensiones con descriptores por nivel y 3 preguntas disparadoras para el docente.',
        ].filter(Boolean).join('\n');
      default:
        return '';
    }
  }, [tool, tema, classTitle, tipoAct, duracion, incluirAct, formatoEval, cantPreguntas, conRubrica,
      estiloSum, extensionSum, slides, extrasPres, instanciaOral, escalaOral, focoOral, hasAttachedDoc,
      material, enfoque, texto, diseno]);

  const needsTema = tool !== 'sum';

  return (
    <div className="brief-card animate-in">
      <div className="brief-header">
        <h4><Wand2 size={15} className="text-ia-accent" /> {TOOL_TITLES[tool]}</h4>
        <button className="btn-icon" title="Cerrar" onClick={onSkip}><X size={15} /></button>
      </div>
      <p className="brief-sub">Contestá estas preguntas rápidas y la IA genera exactamente lo que necesitás.</p>

      {alElegirMaterial && USAN_MATERIAL.includes(tool) && (
        <label className="brief-field">
          <span className="brief-label"><Paperclip size={13} aria-hidden="true" /> Material de tu biblioteca <span className="brief-hint">(opcional)</span></span>
          <select
            className="form-select brief-select"
            value={materialId ?? ''}
            onChange={e => alElegirMaterial(e.target.value || null)}
          >
            <option value="">Sin material: la IA usa lo que sabe del tema</option>
            {materiales.map(m => (
              <option key={m.id} value={m.id}>{m.subjectName ? `${m.subjectName}: ` : ''}{m.title}</option>
            ))}
          </select>
          {materiales.length === 0 && (
            <span className="brief-hint-row">Todavía no tenés materiales con texto. Subilos en Mis materiales y aparecen acá.</span>
          )}
        </label>
      )}

      {needsTema && (
        <div className="brief-field">
          <span className="brief-label">Tema{material && <span className="brief-hint"> (opcional: si lo dejás vacío, todo el material)</span>}</span>
          <input
            className="brief-input"
            type="text"
            value={tema}
            placeholder={material ? material.title : classTitle ? `Ej: ${classTitle}` : 'Ej: Ecosistemas y cadenas alimentarias'}
            onChange={e => setTema(e.target.value)}
            maxLength={140}
          />
        </div>
      )}

      {tool === 'act' && (
        <>
          <PillGroup label="Modalidad" options={['Individual', 'Grupal', 'Experimento práctico', 'Investigación guiada']} value={tipoAct} onChange={setTipoAct} />
          <PillGroup label="Duración" options={['30 min', '45 min', '60 min', '80 min']} value={duracion} onChange={setDuracion} />
          <MultiPillGroup label="Qué incluir" options={['Consignas para el estudiante', 'Materiales necesarios', 'Desarrollo paso a paso', 'Cierre / puesta en común']} values={incluirAct} onChange={setIncluirAct} />
        </>
      )}

      {tool === 'eval' && (
        <>
          <PillGroup label="Formato" options={['Opción múltiple', 'Desarrollo escrito', 'Mixta']} value={formatoEval} onChange={setFormatoEval} />
          <PillGroup label="Cantidad de consignas" options={['5', '8', '10', '12']} value={cantPreguntas} onChange={setCantPreguntas} />
          <PillGroup label="Calificación" options={['Con rúbrica', 'Solo puntajes']} value={conRubrica} onChange={setConRubrica} />
        </>
      )}

      {tool === 'sum' && (
        <>
          {!hasAttachedDoc && !alElegirMaterial && (
            <p className="brief-hint-row">💡 Tip: adjuntá un material de la Biblioteca en el panel derecho y la IA lo usa como fuente.</p>
          )}
          <PillGroup label="Estilo" options={['Conceptos clave', 'Con glosario', 'Con preguntas de comprensión']} value={estiloSum} onChange={setEstiloSum} />
          <PillGroup label="Extensión" options={['Breve', 'Media', 'Detallada']} value={extensionSum} onChange={setExtensionSum} />
        </>
      )}

      {tool === 'pres' && (
        <>
          <PillGroup label="Cantidad de diapositivas" options={['6', '8', '10', '12']} value={slides} onChange={setSlides} />
          <div className="brief-field">
            <span className="brief-label">Enfoque</span>
            <div className="brief-pills">
              {ENFOQUES.map(e => (
                <button key={e.id} type="button" className={`brief-pill ${enfoque === e.id ? 'selected' : ''}`} aria-pressed={enfoque === e.id} title={e.prompt} onClick={() => setEnfoque(e.id)}>
                  {e.nombre}
                </button>
              ))}
            </div>
          </div>
          <div className="brief-field">
            <span className="brief-label">Texto en cada diapositiva</span>
            <div className="brief-pills">
              {TEXTOS.map(t => (
                <button key={t.id} type="button" className={`brief-pill ${texto === t.id ? 'selected' : ''}`} aria-pressed={texto === t.id} title={t.prompt} onClick={() => setTexto(t.id)}>
                  {t.nombre}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="brief-field brief-disenos">
            <legend className="brief-label">Diseño <span className="brief-hint">(lo podés cambiar después, sin volver a generar)</span></legend>
            <div className="brief-disenos-grilla">
              {DISENOS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className={`brief-diseno ${diseno === d.id ? 'selected' : ''}`}
                  aria-pressed={diseno === d.id}
                  title={d.descripcion}
                  onClick={() => setDiseno(d.id)}
                >
                  <span className="brief-diseno-muestra" style={varsDiseno(d)} aria-hidden="true">
                    <span className="brief-diseno-linea titulo" />
                    <span className="brief-diseno-linea" />
                    <span className="brief-diseno-linea corta" />
                  </span>
                  <span className="brief-diseno-nombre">{d.nombre}</span>
                </button>
              ))}
            </div>
            <span className="brief-hint-row">{disenoDe(diseno).descripcion}</span>
          </fieldset>
          <MultiPillGroup label="Extras" options={['Notas para el docente', 'Preguntas disparadoras', 'Actividad de cierre', 'Un emoji por diapositiva', 'Ejemplos cotidianos']} values={extrasPres} onChange={setExtrasPres} />
        </>
      )}

      {tool === 'oral' && (
        <>
          <PillGroup label="Instancia" options={['Exposición individual', 'Debate grupal', 'Defensa de trabajo']} value={instanciaOral} onChange={setInstanciaOral} />
          <PillGroup label="Escala" options={['Numérica 1-10', 'Conceptual', 'Niveles 1-4']} value={escalaOral} onChange={setEscalaOral} />
          <div className="brief-field">
            <span className="brief-label">Foco de la evaluación <span className="brief-hint">(opcional)</span></span>
            <input
              className="brief-input"
              type="text"
              value={focoOral}
              placeholder="Ej: claridad expositiva y uso de vocabulario técnico"
              onChange={e => setFocoOral(e.target.value)}
              maxLength={140}
            />
          </div>
        </>
      )}

      <div className="brief-footer">
        <button className="btn btn-ghost btn-sm" onClick={onSkip}>Omitir y escribir libre</button>
        <button className="btn btn-primary" onClick={() => onGenerate(prompt)}>
          <Wand2 size={15} /> Generar
        </button>
      </div>
    </div>
  );
}
