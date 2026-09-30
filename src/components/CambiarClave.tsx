/**
 * Primer ingreso con la clave que dio la escuela: hay que elegir una
 * propia antes de usar la app. La inicial la vio quien la imprimió o la
 * dictó, así que no puede quedar como clave de todos los días.
 */

import { useState } from 'react';
import { KeyRound, AlertCircle, LogOut, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { clearMustChangePassword } from '../services/profiles.service';
import './CambiarClave.css';

const MIN_LENGTH = 8;

export default function CambiarClave() {
  const { user, refreshProfile, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ver, setVer] = useState(false);

  if (!user) return null;

  const handleSave = async () => {
    if (password.length < MIN_LENGTH) { setError(`La clave tiene que tener al menos ${MIN_LENGTH} caracteres.`); return; }
    if (password !== repeat) { setError('Las dos claves no coinciden.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      await clearMustChangePassword(user.id);
      await refreshProfile();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg.includes('different from the old')
        ? 'Tiene que ser distinta de la clave que te dieron.'
        : 'No se pudo guardar la clave. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cc-screen">
      <form className="card cc-card" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <span className="cc-icono" aria-hidden="true"><KeyRound size={24} /></span>
        <h1 className="cc-titulo">Elegí tu clave</h1>
        <p className="cc-bajada">
          Hola {user.firstName}. Entraste con la clave que te dio la escuela: elegí una tuya
          para seguir, y no se la digas a nadie.
        </p>

        {error && <div className="cc-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

        <div className="cc-campo">
          <label htmlFor="cc-pass">Clave nueva</label>
          <div className="cc-con-ojo">
            <input id="cc-pass" className="form-input" type={ver ? 'text' : 'password'} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} autoFocus aria-describedby="cc-largo" />
            <button type="button" className="btn-icon" onClick={() => setVer(v => !v)}
              aria-label={ver ? 'Ocultar la clave' : 'Mostrar la clave'} aria-pressed={ver}>
              {ver ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <div id="cc-largo" className={`cc-largo ${password.length >= MIN_LENGTH ? 'ok' : ''}`}>
            <span style={{ width: `${Math.min(100, (password.length / MIN_LENGTH) * 100)}%` }} aria-hidden="true" />
            <small>{password.length >= MIN_LENGTH ? <><Check size={13} aria-hidden="true" /> Largo suficiente</> : `Al menos ${MIN_LENGTH} caracteres`}</small>
          </div>
        </div>
        <div className="cc-campo">
          <label htmlFor="cc-repeat">Repetila</label>
          <input id="cc-repeat" className="form-input" type={ver ? 'text' : 'password'} autoComplete="new-password"
            value={repeat} onChange={e => setRepeat(e.target.value)}
            aria-invalid={!!repeat && repeat !== password} />
          {!!repeat && repeat !== password && <small className="cc-no-coincide">Todavía no coinciden</small>}
        </div>

        <button type="submit" className="btn btn-primary w-full cc-boton" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar y entrar'}
        </button>
        <button type="button" className="btn btn-ghost w-full cc-boton" onClick={logout}>
          <LogOut size={15} aria-hidden="true" /> Salir
        </button>
      </form>
    </div>
  );
}
