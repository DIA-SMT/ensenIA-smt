/**
 * El registro de un estudiante en el trimestre: todo junto, lo que hizo en
 * la app y lo que se anotó de papel (pruebas, TP entregados en mano,
 * control de carpeta). Sale de la libreta, que ya tiene todo cargado: no
 * pide nada nuevo al servidor.
 */

import { Link } from 'react-router-dom';
import { X, FileText, PencilLine } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { MARCAS, TIPOS_EVALUACION, type Evaluacion } from '../services/evaluaciones.service';
import type { ColumnaLibreta } from '../services/gradebook.service';
import { TIPOS_ACTIVIDAD } from '../lib/actividades';
import { formatoNota } from '../lib/resumenNotas';
import type { GradebookRow, NotaItem } from '../types';
import './Modals.css';
import './RegistroDelEstudiante.css';

const diaMes = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

/** Lo que va en una casilla de la libreta (y en cada renglón del registro). */
export function CeldaLibreta({ n }: { n: NotaItem | undefined }) {
  // Los símbolos (✓ ½ ✗ NE s/c A) llevan su texto para los lectores de pantalla
  return <><span aria-hidden="true"><Celda n={n} /></span><span className="sr-only">{textoDe(n)}</span></>;
}

function Celda({ n }: { n: NotaItem | undefined }) {
  if (!n) return <span className="text-subtle">·</span>;
  const comentario = n.comentario ? ` · “${n.comentario}”` : '';
  if (n.ausente) return <span className="libreta-ausente" title={`Ausente${comentario}`}>A</span>;
  if (n.marca) {
    return (
      <span className={`libreta-marca ${n.marca}`} title={`${MARCAS[n.marca].label}${n.registro === 'papel' ? ' (en papel)' : ''}${comentario}`}>
        {MARCAS[n.marca].simbolo}
      </span>
    );
  }
  if (n.registro === 'no_entrego') return <span className="libreta-baja" title={`No lo entregó${comentario}`}>NE</span>;
  if (n.sinCorregir) {
    return <span className="text-subtle" title={n.registro === 'papel' ? 'Lo entregó en papel y falta corregirlo' : 'La entregó y falta corregirla'}>s/c</span>;
  }
  return (
    <span className={n.nota !== null && n.nota < 6 ? 'libreta-baja' : undefined}
      title={`${n.registro === 'papel' ? 'En papel' : ''}${comentario}` || undefined}>
      {formatoNota(n.nota as number)}
      {n.registro === 'papel' && <FileText size={10} className="libreta-papel" />}
    </span>
  );
}

function textoDe(n: NotaItem | undefined): string {
  if (!n) return 'Sin nada cargado';
  if (n.ausente) return 'Ausente';
  if (n.marca) return MARCAS[n.marca].label;
  if (n.registro === 'no_entrego') return 'No lo entregó';
  if (n.sinCorregir) return n.registro === 'papel' ? 'Entregado en papel, sin corregir' : 'Entregado, sin corregir';
  return `${formatoNota(n.nota as number)}${n.registro === 'papel' ? ' · en papel' : ''}`;
}

export default function RegistroDelEstudiante({
  fila, columnas, contexto, alEditarEvaluacion, alCerrar,
}: {
  fila: GradebookRow;
  columnas: ColumnaLibreta[];
  /** "Matemática · 3° A · 2° trimestre" */
  contexto: string;
  alEditarEvaluacion: (e: Evaluacion) => void;
  alCerrar: () => void;
}) {
  const conAlgo = columnas.filter(c => fila.notas[c.id]).length;
  const faltan = columnas.filter(c => {
    const n = fila.notas[c.id];
    return !n || n.registro === 'no_entrego' || n.marca === 'no_entrego';
  }).length;

  return (
    <Dialogo abierto alCerrar={alCerrar} etiquetadoPor="reg-titulo" className="dialogo-em">
      <div className="em-modal reg-modal">
        <div className="em-modal-header">
          <h3 id="reg-titulo">{fila.firstName} {fila.lastName}</h3>
          <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={alCerrar}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="em-modal-body reg-cuerpo">
          <p className="em-hint">{contexto}. Lo de la app y lo de papel, en orden.</p>

          <div className="reg-resumen">
            <span><strong>{conAlgo}</strong> de {columnas.length} con algo cargado</span>
            {faltan > 0 && <span className="text-warning"><strong>{faltan}</strong> sin entregar o sin cargar</span>}
            {fila.suggestedGrade !== null && <span>Promedio <strong>{formatoNota(fila.suggestedGrade)}</strong></span>}
            {fila.grade !== null && <span>Nota del trimestre <strong>{formatoNota(fila.grade)}</strong></span>}
          </div>

          {columnas.length === 0 ? (
            <p className="text-sm text-secondary">Todavía no hay nada cargado en este trimestre.</p>
          ) : (
            <ol className="reg-lista">
              {columnas.map(c => {
                const n = fila.notas[c.id];
                const esApp = c.origen === 'actividad';
                const tipo = esApp
                  ? TIPOS_ACTIVIDAD[c.tipoActividad ?? 'actividad']
                  : TIPOS_EVALUACION[c.evaluacion?.tipo ?? 'otra'];
                return (
                  <li key={c.id} className="reg-item">
                    <span className="reg-emoji" aria-hidden="true">{tipo.emoji}</span>
                    <span className="reg-texto">
                      <span className="reg-titulo">{c.titulo}</span>
                      <small>
                        {tipo.label}{esApp ? ' · app' : ''} · {diaMes(c.fecha)}
                      </small>
                      {n?.comentario && <small className="reg-comentario">“{n.comentario}”</small>}
                    </span>
                    <span className="reg-valor">
                      <CeldaLibreta n={n} />
                    </span>
                    {esApp ? (
                      <Link to={`/actividades/${c.id}`} className="btn-icon" aria-label={`Abrir ${c.titulo}`} title="Abrir: ahí se corrige y se anota la entrega en papel">
                        <PencilLine size={15} />
                      </Link>
                    ) : c.evaluacion ? (
                      <button type="button" className="btn-icon" aria-label={`Corregir ${c.titulo}`} title="Corregir"
                        onClick={() => alEditarEvaluacion(c.evaluacion!)}>
                        <PencilLine size={15} />
                      </button>
                    ) : <span />}
                  </li>
                );
              })}
            </ol>
          )}

          {fila.teacherNote && <p className="reg-nota-docente">Tu nota del trimestre: “{fila.teacherNote}”</p>}
        </div>
      </div>
    </Dialogo>
  );
}
