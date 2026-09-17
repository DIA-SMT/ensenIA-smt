/**
 * SMT EstudIA — Grupos del curso (modal del docente)
 *
 * MUY sencillo a propósito: "Armar automáticamente" reparte al curso en
 * grupos parejos con un toque; después se ajusta a mano — tocás un
 * estudiante y tocás el grupo al que va. El docente siempre valida:
 * nada queda guardado hasta que aprieta Guardar.
 */

import { useState, useEffect } from 'react';
import { X, Shuffle, Plus, Trash2, Loader2, Check } from 'lucide-react';
import {
  getGroupsByCourse, saveGroups, autoSplit, GROUP_PRESETS,
  type CourseGroup,
} from '../services/groups.service';
import type { Student } from '../types';
import './GruposModal.css';
import './Modals.css';

interface DraftGroup {
  name: string;
  emoji: string;
  memberIds: string[];
}

export default function GruposModal({ courseId, teacherId, courseName, students, onClose, onSaved }: {
  courseId: string;
  teacherId: string;
  courseName: string;
  students: Student[];
  onClose: () => void;
  onSaved: (groups: CourseGroup[]) => void;
}) {
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(3);
  const [picked, setPicked] = useState<string | null>(null); // estudiante seleccionado para mover
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getGroupsByCourse(courseId)
      .then(gs => setGroups(gs.map(g => ({ name: g.name, emoji: g.emoji, memberIds: g.memberIds }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [courseId]);

  const nameOf = (id: string) => {
    const s = students.find(x => x.id === id);
    return s ? `${s.firstName} ${s.lastName[0]}.` : '—';
  };

  const assigned = new Set(groups.flatMap(g => g.memberIds));
  const unassigned = students.filter(s => !assigned.has(s.id));

  const handleAuto = () => {
    const split = autoSplit(students.map(s => s.id), size);
    setGroups(split.map((ids, i) => ({
      name: GROUP_PRESETS[i % GROUP_PRESETS.length].name,
      emoji: GROUP_PRESETS[i % GROUP_PRESETS.length].emoji,
      memberIds: ids,
    })));
    setPicked(null);
  };

  /** Tocar un estudiante lo selecciona; tocar un grupo lo manda ahí. */
  const handlePick = (id: string) => setPicked(p => (p === id ? null : id));

  const moveTo = (groupIdx: number | null) => {
    if (!picked) return;
    setGroups(prev => {
      const next = prev.map(g => ({ ...g, memberIds: g.memberIds.filter(m => m !== picked) }));
      if (groupIdx !== null) next[groupIdx] = { ...next[groupIdx], memberIds: [...next[groupIdx].memberIds, picked] };
      return next;
    });
    setPicked(null);
  };

  const handleAddGroup = () => {
    const preset = GROUP_PRESETS[groups.length % GROUP_PRESETS.length];
    setGroups(prev => [...prev, { name: preset.name, emoji: preset.emoji, memberIds: [] }]);
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const clean = groups
        .map(g => ({ ...g, name: g.name.trim() || 'Grupo' }))
        .filter(g => g.memberIds.length > 0 || g.name.trim());
      await saveGroups(courseId, teacherId, clean);
      const fresh = await getGroupsByCourse(courseId);
      onSaved(fresh);
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudieron guardar los grupos. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal em-modal-lg grupos-modal" role="dialog" aria-label={`Grupos de ${courseName}`}>
        <div className="em-modal-header">
          <h3>👥 Grupos de {courseName}</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body grupos-body">
          {loading ? <p className="text-secondary">Cargando...</p> : (
            <>
              <div className="grupos-auto card-inset">
                <div className="grupos-auto-text">
                  <strong>Armar automáticamente</strong>
                  <em>Mezcla al curso en grupos parejos. Después ajustás lo que quieras.</em>
                </div>
                <div className="grupos-auto-controls">
                  <select className="form-select" value={size} onChange={e => setSize(Number(e.target.value))} aria-label="Estudiantes por grupo">
                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} por grupo</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleAuto} disabled={students.length === 0}>
                    <Shuffle size={14} /> Armar
                  </button>
                </div>
              </div>

              {picked && (
                <p className="grupos-hint" role="status">
                  Moviendo a <strong>{nameOf(picked)}</strong> — tocá el grupo al que va
                  {' '}<button className="grupos-hint-cancel" onClick={() => setPicked(null)}>cancelar</button>
                </p>
              )}

              <div className="grupos-grid">
                {groups.map((g, idx) => (
                  <div
                    key={idx}
                    className={`grupos-card ${picked ? 'droppable' : ''}`}
                    onClick={() => picked && moveTo(idx)}
                  >
                    <div className="grupos-card-head">
                      <span className="grupos-emoji">{g.emoji}</span>
                      <input
                        className="grupos-name"
                        value={g.name}
                        maxLength={30}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setGroups(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                        aria-label="Nombre del grupo"
                      />
                      <button
                        className="btn-icon"
                        aria-label={`Eliminar ${g.name}`}
                        onClick={e => { e.stopPropagation(); handleRemoveGroup(idx); }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grupos-members">
                      {g.memberIds.length === 0 && <span className="text-xs text-subtle">Sin integrantes — tocá un estudiante y después este grupo</span>}
                      {g.memberIds.map(id => (
                        <button
                          key={id}
                          className={`grupos-chip ${picked === id ? 'picked' : ''}`}
                          onClick={e => { e.stopPropagation(); handlePick(id); }}
                        >
                          {nameOf(id)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <button className="grupos-add" onClick={handleAddGroup}>
                  <Plus size={15} /> Agregar grupo
                </button>
              </div>

              {unassigned.length > 0 && (
                <div className={`grupos-pool ${picked ? '' : ''}`} onClick={() => picked && moveTo(null)}>
                  <p className="grupos-pool-title">Sin grupo ({unassigned.length})</p>
                  <div className="grupos-members">
                    {unassigned.map(s => (
                      <button
                        key={s.id}
                        className={`grupos-chip ${picked === s.id ? 'picked' : ''}`}
                        onClick={e => { e.stopPropagation(); handlePick(s.id); }}
                      >
                        {s.firstName} {s.lastName[0]}.
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}
            </>
          )}
        </div>

        <div className="em-modal-footer">
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            {saving ? 'Guardando...' : 'Guardar grupos'}
          </button>
        </div>
      </div>
    </div>
  );
}
