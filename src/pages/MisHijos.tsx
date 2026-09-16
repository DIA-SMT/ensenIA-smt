/**
 * SMT EstudIA — Mis hijos (familia)
 *
 * Una familia entra con una sola pregunta: ¿cómo le está yendo?
 * Antes veía tres porcentajes sueltos. Ahora ve lo que importa, en
 * lenguaje de familia: cómo viene, sus notas, lo que logró y sus faltas.
 *
 * Nada de jerga escolar ni de la app. Y los check-ins emocionales del
 * chico NO se muestran acá a propósito: eso es entre él y sus docentes.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, Award, CalendarX, BookMarked, MessageSquare,
  AlertTriangle, ChevronRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMyChildren, getChildSummary, type ChildSummary } from '../services/guardians.service';
import type { Student } from '../types';
import './Familias.css';
import './StudentPortal.css';
import './MisHijos.css';

const ABSENCE_LABEL: Record<string, string> = {
  ausente: 'Faltó',
  tarde: 'Llegó tarde',
  justificado: 'Falta justificada',
};

/** El estado en palabras que una familia entiende, sin etiquetas del sistema. */
function comoViene(s: Student): { titulo: string; detalle: string; cls: string } {
  switch (s.status) {
    case 'excellent':
      return { titulo: 'Va muy bien', detalle: 'Está al día y con buen rendimiento.', cls: 'bien' };
    case 'good':
      return { titulo: 'Va bien', detalle: 'Mantiene un buen ritmo de trabajo.', cls: 'bien' };
    case 'warning':
      return { titulo: 'Necesita una mano', detalle: 'Hay cosas para reforzar. Vale la pena acompañarlo estos días.', cls: 'atencion' };
    default:
      return { titulo: 'Necesita apoyo', detalle: 'La escuela está siguiendo su situación de cerca. Conversar con el docente ayuda mucho.', cls: 'apoyo' };
  }
}

export default function MisHijos() {
  const { user } = useAuth();
  const [children, setChildren] = useState<(Student & { relationship: string })[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getMyChildren()
      .then(list => {
        setChildren(list);
        list.forEach(c => {
          getChildSummary(c.id)
            .then(sum => setSummaries(prev => ({ ...prev, [c.id]: sum })))
            .catch(console.error);
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <div className="sp-container animate-in">
      <header className="mh-header">
        <h2>Cómo le está yendo</h2>
        <p className="text-secondary text-sm">
          Lo que la escuela ve del recorrido de {children.length === 1 ? 'tu hijo' : 'tus hijos'}.
        </p>
      </header>

      {loading && <p className="text-secondary">Cargando...</p>}

      {!loading && children.length === 0 && (
        <div className="card acts-empty">
          <GraduationCap size={30} className="text-secondary" />
          <p className="text-secondary">
            Todavía no hay estudiantes vinculados a tu cuenta. Acercate a la escuela para que
            te vinculen con tu hijo o hija.
          </p>
        </div>
      )}

      {children.map(c => {
        const estado = comoViene(c);
        const sum = summaries[c.id];
        const enDiciembre = sum?.grades.filter(g => g.carriesToDecember) ?? [];

        return (
          <div key={c.id} className="card mh-child">
            {/* Quién es y cómo viene */}
            <div className="mh-child-head">
              <div className="mh-avatar">{c.avatarInitials}</div>
              <div className="mh-child-who">
                <h3>{c.firstName} {c.lastName}</h3>
                <span>{c.courseName} · E.M. Gabriela Mistral</span>
              </div>
            </div>

            <div className={`mh-estado mh-${estado.cls}`}>
              <strong>{estado.titulo}</strong>
              <span>{estado.detalle}</span>
            </div>

            {/* Lo urgente primero */}
            {enDiciembre.length > 0 && (
              <div className="mh-aviso">
                <AlertTriangle size={16} />
                <div>
                  <strong>Se lleva {enDiciembre.length === 1 ? 'una materia' : `${enDiciembre.length} materias`} a diciembre</strong>
                  <span>{enDiciembre.map(g => g.subjectName).join(', ')}</span>
                </div>
              </div>
            )}

            {/* Números en contexto */}
            <div className="mh-metrics">
              <div className="mh-metric">
                <span className="mh-metric-val">{c.attendance}%</span>
                <span className="mh-metric-label">asistencia</span>
              </div>
              <div className="mh-metric">
                <span className="mh-metric-val">{c.average}</span>
                <span className="mh-metric-label">promedio</span>
              </div>
              {sum && sum.totalPoints > 0 && (
                <div className="mh-metric">
                  <span className="mh-metric-val mh-points">⭐ {sum.totalPoints}</span>
                  <span className="mh-metric-label">puntos ganados</span>
                </div>
              )}
            </div>

            {/* Sus notas */}
            {sum && sum.grades.length > 0 && (
              <section className="mh-section">
                <h4><BookMarked size={14} /> Sus notas</h4>
                <div className="mh-grades">
                  {sum.grades.map((g, i) => (
                    <div key={i} className={`mh-grade ${g.carriesToDecember ? 'debe' : ''}`}>
                      <span className="mh-grade-subject">{g.subjectName}</span>
                      <span className="mh-grade-val">{g.grade ?? '—'}</span>
                      {g.teacherNote && <span className="mh-grade-note">{g.teacherNote}</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Lo que logró: lo más lindo de mostrarle a una familia */}
            {sum && sum.achievements.length > 0 && (
              <section className="mh-section">
                <h4><Award size={14} /> Lo que logró</h4>
                <div className="mh-awards">
                  {sum.achievements.slice(0, 8).map((a, i) => (
                    <div key={i} className="mh-award" title={`+${a.points} puntos`}>
                      <span className="mh-award-emoji">{a.emoji}</span>
                      <span className="mh-award-title">{a.title}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Faltas, solo si las hay */}
            {sum && sum.absences.length > 0 && (
              <section className="mh-section">
                <h4><CalendarX size={14} /> Sus faltas</h4>
                <div className="mh-absences">
                  {sum.absences.map((a, i) => (
                    <span key={i} className="mh-absence">
                      {ABSENCE_LABEL[a.status] ?? a.status}
                      {a.date && ` · ${new Date(a.date + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {sum && sum.grades.length === 0 && sum.achievements.length === 0 && (
              <p className="text-sm text-subtle mh-sin-datos">
                <Sparkles size={13} /> Todavía no hay notas ni logros cargados para este trimestre.
              </p>
            )}

            <Link to="/comunicados-familia" className="mh-cta">
              <MessageSquare size={15} />
              <span>Ver los comunicados de la escuela</span>
              <ChevronRight size={16} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
