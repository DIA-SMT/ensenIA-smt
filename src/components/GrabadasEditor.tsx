/**
 * Clases grabadas de una materia+curso (docente).
 *
 * La escuela no aloja video: el docente sube a YouTube, Drive o Meet y
 * pega el link. Si le asigna una unidad, la grabación aparece junto a
 * ese tema en el temario del estudiante, que es donde la va a buscar.
 */

import { useState, useEffect } from 'react';
import { Video, Plus, Trash2, Save, Eye, EyeOff, X, CheckCircle, ExternalLink } from 'lucide-react';
import {
  getRecordingsForTeacher, saveRecording, deleteRecording,
  detectProvider, PROVIDER_LABELS,
} from '../services/recordings.service';
import type { AcademicTerm, PlanningUnit, RecordedClass } from '../types';
// Reusa la grilla de formulario de Normativa: mismo gesto de carga, y el
// proyecto ya cruza CSS entre páginas y componentes.
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import './Modals.css';
import '../pages/Settings.css';
import '../pages/Libreta.css';
import '../pages/Normativa.css';

interface GrabadasEditorProps {
  schoolId: string;
  subjectId: string;
  courseId: string;
  term: AcademicTerm;
  units: PlanningUnit[];
}

const VACIA = {
  id: null as string | null,
  unitId: '' as string,
  title: '',
  description: '',
  url: '',
  durationMin: '',
  recordedOn: '',
  isPublished: false,
};

export default function GrabadasEditor({
  schoolId, subjectId, courseId, term, units,
}: GrabadasEditorProps) {
  const [grabadas, setGrabadas] = useState<RecordedClass[] | null>(null);
  const [form, setForm] = useState<typeof VACIA | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const clave = `${subjectId}|${courseId}`;

  useEffect(() => {
    let cancelado = false;
    setGrabadas(null);
    setForm(null);
    setError('');
    setOkMsg('');
    getRecordingsForTeacher(subjectId, courseId)
      .then(r => { if (!cancelado) setGrabadas(r); })
      .catch(err => {
        console.error(err);
        if (!cancelado) { setGrabadas([]); setError('No se pudieron cargar las grabaciones.'); }
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const recargar = async () => setGrabadas(await getRecordingsForTeacher(subjectId, courseId));

  const guardar = async (publicar: boolean) => {
    if (!form) return;
    if (!form.title.trim()) { setError('Poné un título.'); return; }
    if (!form.url.trim()) { setError('Pegá el link de la grabación.'); return; }
    try { new URL(form.url.trim()); }
    catch { setError('Ese link no parece una dirección válida.'); return; }

    // Guardar sin publicar algo que YA estaba publicado lo saca del
    // temario. El botón no se lee así.
    if (!publicar && form.isPublished) {
      const ok = window.confirm(
        `"${form.title}" ya está publicada. Si la guardás sin publicar, deja de verla ` +
        'el curso.\n\n¿La retiro del temario?'
      );
      if (!ok) return;
    }

    setBusy(true); setError(''); setOkMsg('');
    try {
      await saveRecording({
        id: form.id, schoolId, subjectId, courseId,
        unitId: form.unitId || null,
        termId: term.id,
        title: form.title, description: form.description, url: form.url,
        durationMin: form.durationMin, recordedOn: form.recordedOn,
        isPublished: publicar,
      });
      await recargar();
      setForm(null);
      setOkMsg(publicar
        ? 'Grabación publicada: ya la ven en el temario.'
        : 'Grabación guardada. No la ve el curso.');
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? 'No se pudo guardar la grabación.');
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (r: RecordedClass) => {
    if (!window.confirm(`Se elimina "${r.title}" del temario. El video en sí no se toca.\n\n¿La saco?`)) return;
    setBusy(true); setError(''); setOkMsg('');
    try {
      await deleteRecording(r.id);
      await recargar();
      setOkMsg('Grabación eliminada.');
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar la grabación.');
    } finally {
      setBusy(false);
    }
  };

  if (grabadas === null) return <p className="text-secondary p-6">Cargando grabaciones…</p>;

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <div className="libreta-toolbar" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="libreta-field" style={{ flex: 1 }}>
          <label>Clases grabadas</label>
          <span className="text-secondary text-sm">
            Pegá el link de YouTube, Drive o Meet. Si le asignás una unidad, aparece
            junto a ese tema en el temario.
          </span>
        </div>
        <button
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => { setForm({ ...VACIA }); setError(''); setOkMsg(''); }}
        >
          <Plus size={14} /> Agregar
        </button>
      </div>

      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {form && (
          <div className="temario-criteria-box">
            <div className="norm-editor-head">
              <strong className="text-sm">{form.id ? 'Editar grabación' : 'Nueva grabación'}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setForm(null)} disabled={busy}>
                <X size={14} />
              </button>
            </div>

            <div className="norm-grid">
              <label className="norm-field norm-field-wide">
                <span>Título</span>
                <input
                  className="form-input" value={form.title} disabled={busy}
                  placeholder="Clase 3 — Tabla periódica"
                  onChange={e => setForm({ ...form, title: e.target.value })}
                />
              </label>

              <label className="norm-field norm-field-wide">
                <span>Link de la grabación</span>
                <input
                  className="form-input" value={form.url} disabled={busy}
                  placeholder="https://youtu.be/…"
                  onChange={e => setForm({ ...form, url: e.target.value })}
                />
                {form.url.trim() && (
                  <small className="em-hint">
                    Detectado: {PROVIDER_LABELS[detectProvider(form.url)]}
                    {detectProvider(form.url) === 'otro' && ' — se va a abrir en otra pestaña, no embebido.'}
                  </small>
                )}
              </label>

              <label className="norm-field">
                <span>Unidad del temario</span>
                <select
                  className="form-select" value={form.unitId} disabled={busy}
                  onChange={e => setForm({ ...form, unitId: e.target.value })}
                >
                  <option value="">Sin unidad (queda al final)</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.title}</option>)}
                </select>
              </label>

              <label className="norm-field">
                <span>Fecha de la clase</span>
                <input
                  type="date" className="form-input" value={form.recordedOn} disabled={busy}
                  onChange={e => setForm({ ...form, recordedOn: e.target.value })}
                />
              </label>

              <label className="norm-field">
                <span>Duración (minutos)</span>
                <input
                  type="number" min={1} className="form-input" value={form.durationMin} disabled={busy}
                  onChange={e => setForm({ ...form, durationMin: e.target.value })}
                />
              </label>

              <label className="norm-field norm-field-wide">
                <span>De qué trata (opcional)</span>
                <textarea
                  className="form-textarea" rows={2} value={form.description} disabled={busy}
                  placeholder="Repaso de números atómicos y cálculo de neutrones."
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </label>
            </div>

            <div className="libreta-actions-right">
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => guardar(false)}>
                <Save size={14} /> Guardar sin publicar
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => guardar(true)}>
                <Eye size={14} /> Publicar
              </button>
            </div>
          </div>
        )}

        {grabadas.length === 0 && !form && (
          <p className="text-secondary text-sm">
            Todavía no hay clases grabadas de esta materia. Si grabás con Meet, el link
            que queda en Drive sirve tal cual.
          </p>
        )}

        {grabadas.map(r => {
          const unidad = units.find(u => u.id === r.unitId);
          return (
            <div key={r.id} className="temario-unit-row">
              <Video size={15} className="text-subtle" />
              <span className="temario-unit-title">{r.title}</span>
              <span className="temario-unit-meta">
                {unidad ? unidad.title : 'sin unidad'}
                {r.durationMin ? ` · ${r.durationMin} min` : ''}
                {' · '}{PROVIDER_LABELS[r.provider]}
              </span>
              {r.isPublished
                ? <span className="badge badge-success"><Eye size={11} /> Publicada</span>
                : <span className="badge badge-warning"><EyeOff size={11} /> Borrador</span>}
              <a className="btn btn-ghost btn-sm" href={r.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={13} />
              </a>
              <button
                className="btn btn-outline btn-sm"
                disabled={busy}
                onClick={() => setForm({
                  id: r.id, unitId: r.unitId ?? '', title: r.title,
                  description: r.description ?? '', url: r.url,
                  durationMin: r.durationMin ? String(r.durationMin) : '',
                  recordedOn: r.recordedOn ?? '', isPublished: r.isPublished,
                })}
              >
                Editar
              </button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => borrar(r)}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {error && <div className="em-error">{error}</div>}
        {okMsg && <div className="libreta-ok"><CheckCircle size={14} /> {okMsg}</div>}
      </div>
    </div>
  );
}
