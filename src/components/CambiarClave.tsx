/**
 * Primer ingreso con la clave que dio la escuela: hay que elegir una
 * propia antes de usar la app. La inicial la vio quien la imprimió o la
 * dictó, así que no puede quedar como clave de todos los días.
 */

import { useState } from 'react';
import { KeyRound, AlertCircle, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { clearMustChangePassword } from '../services/profiles.service';
import './Modals.css';
import './CambiarClave.css';

const MIN_LENGTH = 8;

export default function CambiarClave() {
  const { user, refreshProfile, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      <div className="card cc-card">
        <KeyRound size={30} className="text-cyan" />
        <h2>Elegí tu clave</h2>
        <p className="text-secondary text-sm">
          Hola {user.firstName}. Entraste con la clave que te dio la escuela: elegí una tuya
          para seguir. Que tenga al menos {MIN_LENGTH} caracteres y no se la digas a nadie.
        </p>

        {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}

        <div className="em-field">
          <label htmlFor="cc-pass">Clave nueva</label>
          <input id="cc-pass" type="password" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} autoFocus />
        </div>
        <div className="em-field">
          <label htmlFor="cc-repeat">Repetila</label>
          <input id="cc-repeat" type="password" autoComplete="new-password" value={repeat}
            onChange={e => setRepeat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
        </div>

        <button className="btn btn-primary w-full" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar y entrar'}
        </button>
        <button className="btn btn-ghost w-full" onClick={logout}>
          <LogOut size={15} /> Salir
        </button>
      </div>
    </div>
  );
}
