/**
 * Brief guiado del Laboratorio IA: antes de generar, la herramienta le hace
 * al docente una serie MÍNIMA de preguntas (3-4 campos) para especificar el
 * resultado. Con eso armamos un prompt preciso en lugar de un pedido genérico.
 *
 * El docente siempre puede "Omitir" y escribir libre como antes.
 */

import { useMemo, useState } from 'react';
import { Wand2, X } from 'lucide-react';
import type { IAToolType } from '../types';

interface Props {
  tool: IAToolType;
  classTitle?: string;
  hasAttachedDoc: boolean;
  onGenerate: (prompt: string) => void;
  onSkip: () => void;
}

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

export default function ToolBriefForm({ tool, classTitle, hasAttachedDoc, onGenerate, onSkip }: Props) {
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

  const [instanciaOral, setInstanciaOral] = useState('Exposición individual');
  const [escalaOral, setEscalaOral] = useState('Numérica 1-10');
  const [focoOral, setFocoOral] = useState('');

  const prompt = useMemo(() => {
    const temaTxt = tema.trim() || classTitle || 'el tema de la clase seleccionada';
    switch (tool) {
      case 'act':
        return [
          `Generá UNA actividad didáctica sobre "${temaTxt}".`,
          `Modalidad: ${tipoAct.toLowerCase()}. Duración estimada: ${duracion}.`,
          incluirAct.length > 0 ? `Incluí: ${incluirAct.map(s => s.toLowerCase()).join(', ')}.` : '',
          'Formato claro en Markdown, lista para dar en clase. No agregues alternativas ni variantes: una sola actividad bien desarrollada.',
        ].filter(Boolean).join('\n');
      case 'eval':
        return [
          `Creá una evaluación sobre "${temaTxt}".`,
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
          `Cantidad: ${slides} slides. Una idea por slide, con título y 3-4 viñetas.`,
          extrasPres.length > 0 ? `Incluí además: ${extrasPres.map(s => s.toLowerCase()).join(', ')}.` : '',
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
      estiloSum, extensionSum, slides, extrasPres, instanciaOral, escalaOral, focoOral, hasAttachedDoc]);

  const needsTema = tool !== 'sum';

  return (
    <div className="brief-card animate-in">
      <div className="brief-header">
        <h4><Wand2 size={15} className="text-ia-accent" /> {TOOL_TITLES[tool]}</h4>
        <button className="btn-icon" title="Cerrar" onClick={onSkip}><X size={15} /></button>
      </div>
      <p className="brief-sub">Contestá estas preguntas rápidas y la IA genera exactamente lo que necesitás.</p>

      {needsTema && (
        <div className="brief-field">
          <span className="brief-label">Tema</span>
          <input
            className="brief-input"
            type="text"
            value={tema}
            placeholder={classTitle ? `Ej: ${classTitle}` : 'Ej: Ecosistemas y cadenas alimentarias'}
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
          {!hasAttachedDoc && (
            <p className="brief-hint-row">💡 Tip: adjuntá un material de la Biblioteca en el panel derecho y la IA lo usa como fuente.</p>
          )}
          <PillGroup label="Estilo" options={['Conceptos clave', 'Con glosario', 'Con preguntas de comprensión']} value={estiloSum} onChange={setEstiloSum} />
          <PillGroup label="Extensión" options={['Breve', 'Media', 'Detallada']} value={extensionSum} onChange={setExtensionSum} />
        </>
      )}

      {tool === 'pres' && (
        <>
          <PillGroup label="Cantidad de slides" options={['6', '8', '10', '12']} value={slides} onChange={setSlides} />
          <MultiPillGroup label="Extras" options={['Notas para el docente', 'Preguntas disparadoras', 'Actividad de cierre']} values={extrasPres} onChange={setExtrasPres} />
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
