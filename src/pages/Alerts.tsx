/**
 * ENSEÑIA SMT — Sistema de Alertas (Fase 2)
 *
 * Ciclo de vida real: abierta → en seguimiento (con intervención
 * registrada) → cerrada (con resultado). La dirección además ve las
 * escaladas y configura los umbrales de su escuela.
 */

import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle, Info, CheckCircle, ArrowUpRight, SlidersHorizontal,
    ClipboardCheck, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAlertsByTeacher, getAlertsBySchool, startFollowUp, closeAlert } from '../services/alerts.service';
import { getThresholds, saveThresholds } from '../services/thresholds.service';
import { formatRelative } from '../lib/format';
import {
    ALERT_STATUS_META, ALERT_OUTCOME_META,
    type Alert, type AlertOutcome, type AlertThresholds,
} from '../types';
import './Alerts.css';
import '../components/Modals.css';

type StatusFilter = 'activas' | 'cerradas' | 'todas';

/* ── Modal de umbrales (solo dirección) ── */

function ThresholdsModal({ initial, onSave, onClose }: {
    initial: AlertThresholds;
    onSave: (t: AlertThresholds) => Promise<void>;
    onClose: () => void;
}) {
    const [t, setT] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const set = (key: keyof AlertThresholds, value: number) =>
        setT(prev => ({ ...prev, [key]: value }));

    const fields: { key: keyof AlertThresholds; label: string; help: string; min: number; max: number }[] = [
        { key: 'negativeCheckinsCount', label: 'Check-ins negativos para alertar', help: 'Cantidad de check-ins "confundido/frustrado" que dispara la alerta de bienestar.', min: 1, max: 10 },
        { key: 'negativeCheckinsDays', label: 'Ventana de check-ins (días)', help: 'En cuántos días se cuentan esos check-ins.', min: 1, max: 30 },
        { key: 'lowScorePct', label: 'Umbral de bajo desempeño (%)', help: 'Entregas con puntaje igual o menor a este porcentaje generan alerta.', min: 10, max: 90 },
        { key: 'inactivityDays', label: 'Días sin actividad (abandono)', help: 'Días sin huella digital, entregas ni práctica para marcar posible abandono.', min: 3, max: 60 },
        { key: 'escalationHours', label: 'Horas para escalar a dirección', help: 'Alertas críticas sin intervención pasan a dirección después de estas horas.', min: 12, max: 336 },
    ];

    const handleSave = async () => {
        // Los min/max del input son solo visuales: validar acá con mensaje
        // por campo, espejando los CHECK de la migración 010.
        for (const f of fields) {
            const v = t[f.key] as number;
            if (!Number.isInteger(v) || v < f.min || v > f.max) {
                setError(`«${f.label}» debe ser un entero entre ${f.min} y ${f.max}.`);
                return;
            }
        }
        setSaving(true);
        setError('');
        try {
            await onSave(t);
            onClose();
        } catch {
            setError('No se pudieron guardar los umbrales. Probá de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="em-modal-overlay" onClick={onClose}>
            <div className="em-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
                <div className="em-modal-header">
                    <h3><SlidersHorizontal size={18} />Umbrales de alerta</h3>
                    <button className="btn btn-ghost" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="em-modal-body">
                    <p className="em-hint">
                        Cada escuela tiene su realidad: ajustá cuándo el sistema debe avisar.
                        Los cambios rigen para las alertas nuevas.
                    </p>
                    {fields.map(f => (
                        <div key={f.key} className="em-field">
                            <label>{f.label}</label>
                            <input
                                type="number"
                                min={f.min}
                                max={f.max}
                                value={t[f.key] as number}
                                onChange={e => set(f.key, Number(e.target.value))}
                            />
                            <span className="em-hint">{f.help}</span>
                        </div>
                    ))}
                    {error && <p className="em-error">{error}</p>}
                </div>
                <div className="em-modal-footer">
                    <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando…' : 'Guardar umbrales'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Acción sobre una alerta (seguimiento / cierre) ── */

function AlertActionForm({ mode, onSubmit, onCancel }: {
    mode: 'seguimiento' | 'cierre';
    onSubmit: (note: string, outcome?: AlertOutcome) => Promise<void>;
    onCancel: () => void;
}) {
    const [note, setNote] = useState('');
    const [outcome, setOutcome] = useState<AlertOutcome>('resuelta');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handle = async () => {
        if (mode === 'seguimiento' && !note.trim()) return;
        setBusy(true);
        setError('');
        try {
            await onSubmit(note, mode === 'cierre' ? outcome : undefined);
        } catch (err) {
            setError(err instanceof Error && err.message.includes('disponible')
                ? err.message
                : 'No se pudo guardar. Revisá la conexión y probá de nuevo.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="alert-action-form">
            {mode === 'cierre' && (
                <select className="form-select" value={outcome} onChange={e => setOutcome(e.target.value as AlertOutcome)}>
                    {(Object.keys(ALERT_OUTCOME_META) as AlertOutcome[]).map(o => (
                        <option key={o} value={o}>{ALERT_OUTCOME_META[o]}</option>
                    ))}
                </select>
            )}
            <textarea
                className="form-textarea"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={mode === 'seguimiento'
                    ? 'Qué se hizo o se va a hacer (queda registrado)…'
                    : 'Nota de cierre (opcional)…'}
            />
            {error && <p className="text-danger text-sm">{error}</p>}
            <div className="alert-action-buttons">
                <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancelar</button>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handle}
                    disabled={busy || (mode === 'seguimiento' && !note.trim())}
                >
                    {busy ? 'Guardando…' : mode === 'seguimiento' ? 'Registrar intervención' : 'Cerrar alerta'}
                </button>
            </div>
        </div>
    );
}

/* ── Página ── */

export default function Alerts() {
    const { user, isDirector } = useAuth();
    const [alertsList, setAlertsList] = useState<Alert[]>([]);
    const [filter, setFilter] = useState<StatusFilter>('activas');
    const [actionOn, setActionOn] = useState<{ id: string; mode: 'seguimiento' | 'cierre' } | null>(null);
    const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
    const [showThresholds, setShowThresholds] = useState(false);

    const load = () => {
        if (!user) return;
        const q = isDirector ? getAlertsBySchool(user.schoolId) : getAlertsByTeacher(user.id);
        q.then(setAlertsList).catch(console.error);
    };

    useEffect(() => {
        if (!user) return;
        load();
        if (isDirector) {
            getThresholds(user.schoolId).then(setThresholds).catch(console.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, isDirector]);

    const counts = useMemo(() => ({
        abiertas: alertsList.filter(a => a.status === 'abierta').length,
        seguimiento: alertsList.filter(a => a.status === 'en_seguimiento').length,
        escaladas: alertsList.filter(a => a.escalatedAt && a.status !== 'cerrada').length,
        cerradas: alertsList.filter(a => a.status === 'cerrada').length,
    }), [alertsList]);

    const visible = useMemo(() => {
        if (filter === 'activas') return alertsList.filter(a => a.status !== 'cerrada');
        if (filter === 'cerradas') return alertsList.filter(a => a.status === 'cerrada');
        return alertsList;
    }, [alertsList, filter]);

    if (!user) return null;

    const subtitle = isDirector
        ? 'Monitoreo de toda la institución, con intervención registrada'
        : 'Alertas de tus estudiantes y cursos';

    const doFollowUp = async (alertId: string, note: string) => {
        await startFollowUp(alertId, note);
        setActionOn(null);
        load();
    };

    const doClose = async (alert: Alert, note: string, outcome: AlertOutcome) => {
        // La nota de cierre se AGREGA a la intervención registrada, nunca la pisa.
        const closeNote = note.trim()
            ? (alert.interventionNote ? `${alert.interventionNote}\n[Cierre] ${note.trim()}` : note.trim())
            : undefined;
        await closeAlert(alert.id, outcome, closeNote);
        setActionOn(null);
        load();
    };

    return (
        <div className="alerts-container">
            <header className="alerts-header">
                <div>
                    <h2 className="page-title">Sistema de Alertas Tempranas</h2>
                    <p className="text-secondary mt-1">{subtitle}</p>
                </div>
                {isDirector && thresholds && (
                    <div className="alerts-actions">
                        <button className="btn btn-primary text-sm" onClick={() => setShowThresholds(true)}>
                            <SlidersHorizontal size={15} />
                            Configurar Umbrales
                        </button>
                    </div>
                )}
            </header>

            {/* Resumen por estado */}
            <div className="alerts-summary-grid">
                <button
                    className={`card alert-summary-card ${filter === 'activas' ? 'active' : ''}`}
                    onClick={() => setFilter('activas')}
                >
                    <span className="summary-count text-danger">{counts.abiertas}</span>
                    <span className="summary-label">Abiertas</span>
                </button>
                <div className="card alert-summary-card static">
                    <span className="summary-count text-warning">{counts.seguimiento}</span>
                    <span className="summary-label">En seguimiento</span>
                </div>
                <div className="card alert-summary-card static">
                    <span className="summary-count" style={{ color: '#818CF8' }}>{counts.escaladas}</span>
                    <span className="summary-label">Escaladas</span>
                </div>
                <button
                    className={`card alert-summary-card ${filter === 'cerradas' ? 'active' : ''}`}
                    onClick={() => setFilter(filter === 'cerradas' ? 'activas' : 'cerradas')}
                >
                    <span className="summary-count text-success">{counts.cerradas}</span>
                    <span className="summary-label">Cerradas</span>
                </button>
            </div>

            {/* Lista con ciclo de vida */}
            <div className="card padding-lg">
                <div className="widget-header" style={{ marginBottom: '1rem' }}>
                    <h3 className="text-lg font-semibold">
                        {filter === 'cerradas' ? 'Alertas cerradas' : 'Alertas activas'}
                    </h3>
                    <span className="badge badge-neutral">{visible.length}</span>
                </div>

                {visible.length === 0 && (
                    <p className="text-secondary text-sm">
                        {filter === 'cerradas' ? 'Todavía no hay alertas cerradas.' : 'Sin alertas activas. 🎉'}
                    </p>
                )}

                <div className="lifecycle-list">
                    {visible.map(alert => {
                        const statusMeta = ALERT_STATUS_META[alert.status];
                        const isActing = actionOn?.id === alert.id;
                        return (
                            <div key={alert.id} className={`lifecycle-item alert-${alert.type}`}>
                                <div className="lifecycle-icon">
                                    {alert.type === 'danger' && <AlertTriangle size={16} />}
                                    {alert.type === 'warning' && <Info size={16} />}
                                    {alert.type === 'success' && <CheckCircle size={16} />}
                                </div>
                                <div className="lifecycle-body">
                                    <div className="lifecycle-top">
                                        <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                                        {alert.escalatedAt && alert.status !== 'cerrada' && (
                                            <span className="badge badge-escalada">
                                                <ArrowUpRight size={11} /> Escalada a dirección
                                            </span>
                                        )}
                                        <span className="text-xs text-subtle">{formatRelative(alert.createdAt)}</span>
                                    </div>
                                    <p className="lifecycle-msg">{alert.message}</p>

                                    {alert.interventionNote && (
                                        <p className="lifecycle-intervention">
                                            <ClipboardCheck size={13} />
                                            {alert.interventionNote}
                                            {alert.interventionAt && <span className="text-subtle"> · {formatRelative(alert.interventionAt)}</span>}
                                        </p>
                                    )}
                                    {alert.status === 'cerrada' && alert.closedOutcome && (
                                        <p className="text-xs text-subtle">
                                            Resultado: {ALERT_OUTCOME_META[alert.closedOutcome]}
                                            {alert.closedAt ? ` · ${formatRelative(alert.closedAt)}` : ''}
                                        </p>
                                    )}

                                    {isActing ? (
                                        <AlertActionForm
                                            mode={actionOn.mode}
                                            onCancel={() => setActionOn(null)}
                                            onSubmit={(note, outcome) =>
                                                actionOn.mode === 'seguimiento'
                                                    ? doFollowUp(alert.id, note)
                                                    : doClose(alert, note, outcome ?? 'resuelta')
                                            }
                                        />
                                    ) : alert.status !== 'cerrada' && (
                                        <div className="lifecycle-actions">
                                            {alert.status === 'abierta' && (
                                                <button
                                                    className="btn btn-outline btn-sm"
                                                    onClick={() => setActionOn({ id: alert.id, mode: 'seguimiento' })}
                                                >
                                                    Tomar en seguimiento
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => setActionOn({ id: alert.id, mode: 'cierre' })}
                                            >
                                                Cerrar con resultado
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showThresholds && thresholds && (
                <ThresholdsModal
                    initial={thresholds}
                    onClose={() => setShowThresholds(false)}
                    onSave={async t => {
                        await saveThresholds(t);
                        setThresholds(t);
                    }}
                />
            )}
        </div>
    );
}
