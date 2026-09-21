/**
 * Editor de temario y criterios (docente).
 *
 * Dos gestos, uno por pedido de las escuelas:
 *  · ubicar cada unidad de la planificación en un trimestre — eso es lo
 *    que la vuelve visible como temario para estudiantes y familias;
 *  · escribir los criterios de evaluación del trimestre y publicarlos.
 */

import { useEffect, useRef, useState } from 'react';
import { Save, Eye, EyeOff, CheckCircle, BookOpen } from 'lucide-react';
import {
  getUnitsForTeacher, setUnitTerm, getCriteria, saveCriteria,
} from '../services/syllabus.service';
import GrabadasEditor from './GrabadasEditor';
import type { AcademicTerm, PlanningUnit, EvaluationCriteria } from '../types';

interface TemarioEditorProps {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  term: AcademicTerm;
  terms: AcademicTerm[];
}

export default function TemarioEditor({
  teacherId, schoolId, subjectId, courseId, term, terms,
}: TemarioEditorProps) {
  const [units, setUnits] = useState<PlanningUnit[] | null>(null);
  const [criteria, setCriteria] = useState<EvaluationCriteria | null>(null);
  const [texto, setTexto] = useState('');
  const [publicado, setPublicado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // Qué materia/curso/trimestre está mirando el docente AHORA. Una recarga
  // lanzada antes de cambiar de materia no debe pisar el estado de la nueva:
  // si lo hiciera, criteria.id quedaría apuntando a la fila de la materia
  // anterior y el siguiente guardado escribiría ahí.
  const clave = `${teacherId}|${subjectId}|${courseId}|${term.id}`;
  const claveActual = useRef(clave);
  claveActual.current = clave;

  const cargar = async () => {
    const mia = clave;
    const [u, c] = await Promise.all([
      getUnitsForTeacher(teacherId, subjectId, courseId),
      getCriteria(subjectId, courseId, term.id),
    ]);
    if (claveActual.current !== mia) return;
    setUnits(u);
    setCriteria(c);
    setTexto(c?.criteria ?? '');
    setPublicado(c?.isPublished ?? false);
  };

  useEffect(() => {
    setUnits(null);
    setError('');
    setOkMsg('');
    cargar().catch(err => {
      console.error(err);
      if (claveActual.current !== clave) return;
      setError('No se pudo cargar el temario.');
      setUnits([]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, subjectId, courseId, term.id]);

  const cambiarTrimestre = async (unitId: string, value: string) => {
    const mia = clave;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await setUnitTerm(unitId, value || null);
      await cargar();
      // El docente pudo cambiar de materia mientras esto viajaba: el cartel
      // tiene que hablar de lo que está mirando, no de lo que dejó atrás.
      if (claveActual.current === mia) {
        setOkMsg(value ? 'Unidad publicada en el temario.' : 'Unidad devuelta a borrador.');
      }
    } catch (err) {
      console.error(err);
      if (claveActual.current === mia) setError('No se pudo mover la unidad de trimestre.');
    } finally {
      setBusy(false);
    }
  };

  const guardarCriterios = async (publicar: boolean) => {
    if (!texto.trim()) { setError('Escribí los criterios antes de guardar.'); return; }
    // Guardar sin publicar algo que YA estaba publicado lo retira de la
    // vista de estudiantes y familias. El botón no se lee así, y el que
    // publica notas en la otra pestaña también pregunta antes.
    if (!publicar && publicado) {
      const ok = window.confirm(
        'Estos criterios ya están publicados. Si guardás sin publicar, dejan de ' +
        'verlos estudiantes y familias hasta que los vuelvas a publicar.\n\n¿Los retiro?'
      );
      if (!ok) return;
    }
    const mia = clave;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await saveCriteria({
        existingId: criteria?.id ?? null,
        schoolId, subjectId, courseId, termId: term.id,
        criteria: texto, isPublished: publicar,
      });
      await cargar();
      if (claveActual.current === mia) {
        setOkMsg(publicar
          ? 'Criterios publicados: estudiantes y familias ya los ven.'
          : 'Criterios guardados. No los ven estudiantes ni familias.');
      }
    } catch (err) {
      console.error(err);
      if (claveActual.current === mia) setError('No se pudieron guardar los criterios.');
    } finally {
      setBusy(false);
    }
  };

  if (units === null) return <p className="text-secondary p-6">Cargando temario…</p>;

  const enEsteTrimestre = units.filter(u => u.termId === term.id).length;

  return (
    <div className="card">
      <div className="libreta-toolbar" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="libreta-field" style={{ flex: 1 }}>
          <label>Unidades de la planificación</label>
          <span className="text-secondary text-sm">
            Ubicá cada unidad en un trimestre. Al asignarla, pasa a verse como temario
            para estudiantes y familias; sin trimestre queda como borrador tuyo.
          </span>
        </div>
        <div className="libreta-counters">
          <span className="badge badge-neutral">{units.length} unidades</span>
          <span className="badge badge-cyan">{enEsteTrimestre} en {term.name}</span>
        </div>
      </div>

      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {units.length === 0 && (
          <p className="text-secondary text-sm">
            Esta materia todavía no tiene planificación. Creala desde el Laboratorio IA
            o importá el programa anual.
          </p>
        )}

        {units.map(u => (
          <div key={u.id} className="temario-unit-row">
            <BookOpen size={15} className="text-subtle" />
            <span className="temario-unit-title">{u.title}</span>
            <span className="temario-unit-meta">
              {u.classes.length} {u.classes.length === 1 ? 'clase' : 'clases'}
            </span>
            <select
              className="form-select"
              value={u.termId ?? ''}
              disabled={busy}
              onChange={e => cambiarTrimestre(u.id, e.target.value)}
            >
              <option value="">Borrador (sin trimestre)</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              {/* Unidad de un ciclo lectivo anterior: sin esta opción el
                  select no encuentra su valor, cae en la primera y le
                  miente al docente diciéndole que está en borrador. */}
              {u.termId && !terms.some(t => t.id === u.termId) && (
                <option value={u.termId}>Otro ciclo lectivo</option>
              )}
            </select>
          </div>
        ))}

        <div className="temario-criteria-box" style={{ marginTop: 'var(--space-3)' }}>
          <label className="text-sm font-medium">
            Criterios de evaluación — {term.name}
          </label>
          <span className="em-hint">
            Qué se espera del estudiante en este trimestre. Se publica junto al temario.
            Son los criterios de la materia en este curso: si la compartís con otro
            docente, los dos editan el mismo texto.
          </span>
          <textarea
            className="form-textarea"
            rows={6}
            value={texto}
            disabled={busy}
            onChange={e => { setTexto(e.target.value); setOkMsg(''); }}
            placeholder={'· Resuelve las operaciones mostrando el procedimiento.\n· Entrega en tiempo y forma los trabajos prácticos.'}
          />
          <div className="libreta-actions-right">
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => guardarCriterios(false)}>
              <Save size={14} /> Guardar sin publicar
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => guardarCriterios(true)}>
              <Eye size={14} /> Publicar criterios
            </button>
          </div>
          <span className="text-xs text-subtle flex items-center gap-1">
            {publicado
              ? <><Eye size={12} /> Publicados: estudiantes y familias los ven.</>
              : <><EyeOff size={12} /> Sin publicar: no los ven estudiantes ni familias.</>}
          </span>
        </div>

        {error && <div className="em-error">{error}</div>}
        {okMsg && <div className="libreta-ok"><CheckCircle size={14} /> {okMsg}</div>}
      </div>

      {/* Las grabaciones cuelgan del temario, no de una lista aparte: el
          estudiante las busca por tema. */}
      <GrabadasEditor
        schoolId={schoolId}
        subjectId={subjectId}
        courseId={courseId}
        term={term}
        units={units}
      />
    </div>
  );
}
