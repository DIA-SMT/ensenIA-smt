/**
 * Normativa y protocolos de la escuela.
 *
 * Pedido de las escuelas: "carga sencilla de normativa". Dirección
 * escribe el texto acá mismo — sin subir un PDF que después nadie abre —
 * y Migue lo usa para responder citando la norma.
 *
 * La misma pantalla sirve a dos roles: dirección edita, el equipo docente
 * consulta. Lo que cada uno ve lo decide la RLS (015), no esta pantalla.
 */

import { useState, useEffect, useRef } from 'react';
import {
  BookMarked, Plus, Search, Eye, EyeOff, Trash2, Save, X,
  ShieldCheck, ExternalLink, Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getPolicies, savePolicy, deletePolicy,
  CATEGORY_LABELS, AUDIENCE_LABELS,
} from '../services/policies.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { SchoolPolicy, PolicyCategory, PolicyAudience } from '../types';
import './Normativa.css';

const CATEGORIAS = Object.keys(CATEGORY_LABELS) as PolicyCategory[];

const VACIA = {
  id: null as string | null,
  title: '',
  category: 'protocolo' as PolicyCategory,
  audience: 'equipo' as PolicyAudience,
  summary: '',
  body: '',
  sourceUrl: '',
  effectiveFrom: '',
  isPublished: false,
};

export default function Normativa() {
  const { user } = useAuth();
  const puedeEditar = user?.role === 'director';

  const [policies, setPolicies] = useState<SchoolPolicy[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<PolicyCategory | 'todas'>('todas');
  const [abierta, setAbierta] = useState<SchoolPolicy | null>(null);
  const [form, setForm] = useState<typeof VACIA | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  /** Copia de cómo abrió el formulario, para saber si hay cambios sin guardar. */
  const formInicial = useRef<typeof VACIA | null>(null);

  /**
   * Abrir el editor es siempre el mismo gesto: limpiar los carteles del
   * guardado anterior —si no, el "guardada y publicada" de una norma
   * queda arriba del formulario de otra— y traer el editor a la vista,
   * que se renderiza al tope y con la lista larga queda fuera de cuadro.
   */
  const abrirEditor = (datos: typeof VACIA) => {
    // Nada que preguntar si el formulario abierto está intacto.
    if (form && JSON.stringify(form) !== JSON.stringify(formInicial.current)) {
      if (!window.confirm('Tenés cambios sin guardar en el formulario. ¿Los descarto?')) return;
    }
    setError(''); setOkMsg('');
    setForm(datos);
    formInicial.current = datos;
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const cargar = async () => {
    const p = await getPolicies();
    setPolicies(p);
    return p;
  };

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    getPolicies()
      .then(p => { if (!cancelado) setPolicies(p); })
      .catch(err => {
        console.error(err);
        if (!cancelado) { setPolicies([]); setError('No se pudo cargar la normativa.'); }
      });
    return () => { cancelado = true; };
  }, [user]);

  if (!user) return null;

  // publicar llega por parámetro, no por estado: si lo tomáramos de `form`
  // después de un setForm, leeríamos el valor anterior.
  const guardar = async (publicar: boolean) => {
    if (!form) return;
    if (!form.title.trim()) { setError('Poné un título.'); return; }
    if (!form.body.trim()) { setError('El texto de la norma no puede quedar vacío.'); return; }
    // Despublicar algo que la escuela ya estaba leyendo no puede pasar
    // desapercibido detrás de un botón que dice "guardar borrador".
    if (!publicar && form.isPublished) {
      const ok = window.confirm(
        `"${form.title}" está publicada. Si la guardás como borrador, deja de verla ` +
        'el equipo y Migue deja de citarla.\n\n¿La retiro?'
      );
      if (!ok) return;
    }
    setBusy(true); setError(''); setOkMsg('');
    try {
      await savePolicy({ ...form, isPublished: publicar, schoolId: user.schoolId });
      const p = await cargar();
      setOkMsg(publicar
        ? 'Guardada y publicada. Migue ya puede citarla.'
        : 'Guardada como borrador. Todavía no la ve nadie más.');
      setForm(null);
      if (abierta) setAbierta(p.find(x => x.id === abierta.id) ?? null);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? 'No se pudo guardar la norma.');
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (p: SchoolPolicy) => {
    const ok = window.confirm(
      `Se elimina "${p.title}" para siempre y Migue deja de poder citarla.\n\n¿La borro?`
    );
    if (!ok) return;
    setBusy(true); setError(''); setOkMsg('');
    try {
      await deletePolicy(p.id);
      await cargar();
      if (abierta?.id === p.id) setAbierta(null);
      setOkMsg('Norma eliminada.');
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar la norma.');
    } finally {
      setBusy(false);
    }
  };

  const listadas = (policies ?? []).filter(p => {
    if (categoria !== 'todas' && p.category !== categoria) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q)
      || (p.summary ?? '').toLowerCase().includes(q)
      || p.body.toLowerCase().includes(q);
  });

  return (
    <div className="norm-container animate-in">
      <div className="norm-head">
        <div>
          <h2><BookMarked size={20} /> Normativa y protocolos</h2>
          <p className="text-secondary text-sm">
            {puedeEditar
              ? 'Lo que cargues acá es lo que Migue responde cuando el equipo pregunta por una norma. Escribilo en lenguaje claro: se lee, no se descarga.'
              : 'Reglamentos y protocolos de la escuela. Si no encontrás algo, preguntale a Migue.'}
          </p>
        </div>
        {puedeEditar && (
          <button
            className="btn btn-primary"
            onClick={() => { setAbierta(null); abrirEditor({ ...VACIA }); }}
          >
            <Plus size={16} /> Cargar norma
          </button>
        )}
      </div>

      <div className="norm-filters">
        <div className="norm-search">
          <Search size={15} className="text-subtle" />
          <input
            className="form-input"
            placeholder="Buscar por título o contenido…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          value={categoria}
          onChange={e => setCategoria(e.target.value as PolicyCategory | 'todas')}
        >
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>

      {error && <div className="em-error">{error}</div>}
      {okMsg && <div className="libreta-ok"><ShieldCheck size={14} /> {okMsg}</div>}

      {/* ── Editor ── */}
      {form && (
        <div className="card norm-editor" ref={editorRef}>
          <div className="norm-editor-head">
            <h3>{form.id ? 'Editar norma' : 'Nueva norma'}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(null)} disabled={busy}>
              <X size={15} />
            </button>
          </div>

          <div className="norm-grid">
            <label className="norm-field norm-field-wide">
              <span>Título</span>
              <input
                className="form-input"
                value={form.title}
                disabled={busy}
                placeholder="Protocolo ante ausencias prolongadas"
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <label className="norm-field">
              <span>Categoría</span>
              <select
                className="form-select"
                value={form.category}
                disabled={busy}
                onChange={e => setForm({ ...form, category: e.target.value as PolicyCategory })}
              >
                {CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>

            <label className="norm-field">
              <span>Vigente desde</span>
              <input
                type="date"
                className="form-input"
                value={form.effectiveFrom}
                disabled={busy}
                onChange={e => setForm({ ...form, effectiveFrom: e.target.value })}
              />
            </label>

            <label className="norm-field norm-field-wide">
              <span>Quién la puede leer</span>
              <select
                className="form-select"
                value={form.audience}
                disabled={busy}
                onChange={e => setForm({ ...form, audience: e.target.value as PolicyAudience })}
              >
                <option value="equipo">{AUDIENCE_LABELS.equipo}</option>
                <option value="comunidad">{AUDIENCE_LABELS.comunidad}</option>
              </select>
              <small className="em-hint">
                Un protocolo de actuación suele ser del equipo. Un acuerdo de convivencia
                lo tiene que poder leer cualquiera.
              </small>
            </label>

            <label className="norm-field norm-field-wide">
              <span>En una frase</span>
              <input
                className="form-input"
                value={form.summary}
                disabled={busy}
                placeholder="Qué hacer cuando un estudiante falta más de dos semanas seguidas."
                onChange={e => setForm({ ...form, summary: e.target.value })}
              />
              <small className="em-hint">Es lo que Migue muestra al citar la norma.</small>
            </label>

            <label className="norm-field norm-field-wide">
              <span>Texto de la norma</span>
              <textarea
                className="form-textarea"
                rows={14}
                value={form.body}
                disabled={busy}
                placeholder={'## Cuándo se aplica\n\n· Tres inasistencias consecutivas sin aviso.\n\n## Quién interviene\n\n1. El preceptor llama a la familia el mismo día.\n2. …'}
                onChange={e => setForm({ ...form, body: e.target.value })}
              />
              <small className="em-hint">
                Podés usar Markdown: ## para títulos, · o 1. para listas, **negrita**.
              </small>
            </label>

            <label className="norm-field norm-field-wide">
              <span>Link a la resolución oficial (opcional)</span>
              <input
                className="form-input"
                value={form.sourceUrl}
                disabled={busy}
                placeholder="https://…"
                onChange={e => setForm({ ...form, sourceUrl: e.target.value })}
              />
            </label>
          </div>

          <div className="libreta-actions-right">
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => guardar(false)}>
              <Save size={14} /> Guardar borrador
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => guardar(true)}>
              <Eye size={14} /> Publicar
            </button>
          </div>
        </div>
      )}

      {/* ── Listado ── */}
      {policies === null && <p className="text-secondary p-6">Cargando normativa…</p>}

      {policies !== null && listadas.length === 0 && (
        <div className="card norm-empty">
          <BookMarked size={30} className="text-subtle" />
          <p className="text-secondary text-sm">
            {policies.length === 0
              ? (puedeEditar
                ? 'Todavía no cargaste ninguna norma. Empezá por el reglamento interno o el protocolo que más consultan los docentes.'
                : 'La escuela todavía no cargó normativa.')
              : 'Ninguna norma coincide con lo que buscás.'}
          </p>
        </div>
      )}

      <div className="norm-list">
        {listadas.map(p => (
          <div key={p.id} className={`card norm-card ${abierta?.id === p.id ? 'open' : ''}`}>
            <button
              className="norm-card-head"
              onClick={() => setAbierta(abierta?.id === p.id ? null : p)}
              aria-expanded={abierta?.id === p.id}
            >
              <div className="norm-card-main">
                <h4>{p.title}</h4>
                {p.summary && <p className="text-sm text-secondary">{p.summary}</p>}
                <div className="norm-card-meta">
                  <span className="badge badge-cyan">{CATEGORY_LABELS[p.category]}</span>
                  {p.audience === 'comunidad' && (
                    <span className="badge badge-neutral"><Users size={11} /> Toda la comunidad</span>
                  )}
                  {p.effectiveFrom && (
                    <span className="text-xs text-subtle">
                      Vigente desde {new Date(p.effectiveFrom + 'T00:00:00').toLocaleDateString('es-AR')}
                    </span>
                  )}
                  {puedeEditar && (
                    p.isPublished
                      ? <span className="badge badge-success"><Eye size={11} /> Publicada</span>
                      : <span className="badge badge-warning"><EyeOff size={11} /> Borrador</span>
                  )}
                </div>
              </div>
            </button>

            {abierta?.id === p.id && (
              <div className="norm-card-body">
                <MarkdownRenderer content={p.body} />
                {p.sourceUrl && (
                  <a className="norm-source" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={13} /> Resolución oficial
                  </a>
                )}
                {puedeEditar && (
                  <div className="libreta-actions-right">
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => abrirEditor({
                        id: p.id, title: p.title, category: p.category, audience: p.audience,
                        summary: p.summary ?? '', body: p.body, sourceUrl: p.sourceUrl ?? '',
                        effectiveFrom: p.effectiveFrom ?? '', isPublished: p.isPublished,
                      })}
                    >
                      <Save size={14} /> Editar
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => borrar(p)}>
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
