/**
 * Las clases que los docentes mandaron al curso (056), vistas por el
 * estudiante: cada clase con sus partes juntas (diapositivas, juego,
 * diagrama, apunte y tarea), en vez de cinco materiales sueltos.
 *
 * Solo muestra las partes que el estudiante puede abrir: si el docente borró
 * o dejó de compartir un material, no aparece.
 */

import { Link } from 'react-router-dom';
import { Presentation, Puzzle, Network, FileText, ClipboardList, Sparkles, ChevronRight } from 'lucide-react';
import { esJuego } from '../lib/juegos';
import { esDiagrama } from '../lib/diagramas';
import { TAG_PRESENTACION } from '../lib/presentation';
import type { ClaseEnviada } from '../services/clases.service';
import type { LibraryMaterial } from '../types';
import './ClasesEnviadas.css';

/** Qué es cada material de la clase, para el ícono y el orden. */
function parteDe(m: LibraryMaterial): { orden: number; etiqueta: string; icono: typeof FileText } {
  if (m.slides || m.tags.includes(TAG_PRESENTACION)) return { orden: 0, etiqueta: 'Diapositivas', icono: Presentation };
  if (esJuego(m.visual)) return { orden: 1, etiqueta: m.visual.tipo === 'crucigrama' ? 'Crucigrama' : 'Criptograma', icono: Puzzle };
  if (esDiagrama(m.visual)) return { orden: 2, etiqueta: 'Diagrama', icono: Network };
  return { orden: 3, etiqueta: 'Apunte', icono: FileText };
}

/** "hoy", "ayer", "el martes", "el 12/9" */
function cuandoFue(fecha: string): string {
  const d = new Date(fecha);
  const hoy = new Date();
  const dias = Math.floor((new Date(hoy.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `el ${d.toLocaleDateString('es-AR', { weekday: 'long' })}`;
  return `el ${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}`;
}

export default function ClasesEnviadas({ clases, materiales, alAbrir }: {
  clases: ClaseEnviada[];
  /** Los materiales compartidos que el estudiante ya tiene cargados */
  materiales: LibraryMaterial[];
  alAbrir: (m: LibraryMaterial) => void;
}) {
  const porId = new Map(materiales.map(m => [m.id, m]));
  const visibles = clases
    .map(c => ({
      clase: c,
      partes: c.materialIds
        .map(id => porId.get(id))
        .filter((m): m is LibraryMaterial => Boolean(m))
        .map(m => ({ m, ...parteDe(m) }))
        .sort((a, b) => a.orden - b.orden),
    }))
    .filter(x => x.partes.length > 0 || x.clase.activityId);

  if (visibles.length === 0) return null;

  return (
    <section className="ce" aria-labelledby="ce-titulo">
      <h3 id="ce-titulo" className="sp-section-title" aria-level={2}>
        <Sparkles size={17} aria-hidden="true" /> Clases que te mandaron
      </h3>
      <ul className="ce-lista">
        {visibles.map(({ clase, partes }) => (
          <li key={clase.id} className="card ce-clase">
            <div className="ce-cabeza">
              <span className="badge badge-cyan">{clase.subjectName}</span>
              <span className="ce-cuando">{cuandoFue(clase.enviadaAt)}</span>
            </div>
            <h4 className="ce-titulo" aria-level={3}>{clase.titulo}</h4>
            <div className="ce-partes">
              {partes.map(({ m, etiqueta, icono: Icono }) => (
                <button key={m.id} className="ce-parte" onClick={() => alAbrir(m)}>
                  <Icono size={16} aria-hidden="true" /> {etiqueta}
                </button>
              ))}
              {clase.activityId && (
                <Link to={`/mis-actividades/${clase.activityId}`} className="ce-parte ce-tarea">
                  <ClipboardList size={16} aria-hidden="true" /> Tarea
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Aviso en la pantalla de inicio del estudiante: la última clase de esta semana. */
export function AvisoClaseNueva({ clase }: { clase: ClaseEnviada }) {
  return (
    <Link to="/mi-biblioteca" className="card card-interactive ce-aviso">
      <span className="ce-aviso-icono" aria-hidden="true"><Presentation size={20} /></span>
      <span className="ce-aviso-texto">
        <strong>Clase nueva de {clase.subjectName}</strong>
        <span>{clase.titulo} · {cuandoFue(clase.enviadaAt)}</span>
      </span>
      <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
    </Link>
  );
}
