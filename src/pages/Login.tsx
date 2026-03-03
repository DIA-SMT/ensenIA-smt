import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import './Login.css';

/* Inline logo — same SVG used in Sidebar */
function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 40 48" fill="none">
      <defs>
        <linearGradient id="leaf-login" x1="20" y1="46" x2="20" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#005FA3" />
          <stop offset="0.45" stopColor="#00A8FF" />
          <stop offset="1" stopColor="#7BC8F4" />
        </linearGradient>
      </defs>
      <path d="M20 46C20 46 3 30 3 19C3 12 8 7 14 9.5C17 10.5 19 13 20 16C21 13 23 10.5 26 9.5C32 7 37 12 37 19C37 30 20 46 20 46Z" fill="url(#leaf-login)" />
      <circle cx="20" cy="5" r="4.5" fill="#FCD34D" />
    </svg>
  );
}

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, redirect
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Completá email y contraseña.');
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Error de autenticación.');
    }
    // On success, AuthContext sets user and redirect happens via Navigate above
  }

  return (
    <div className="login-page">
      {/* Background glow effects */}
      <div className="login-glow login-glow-1" />
      <div className="login-glow login-glow-2" />

      <div className="login-card animate-scale">
        {/* Header */}
        <div className="login-header">
          <LogoMark size={48} />
          <h1 className="login-title">ENSEÑIA SMT</h1>
          <p className="login-subtitle">Escuela Municipal Alfonsina Storni</p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error animate-fade">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu.email@ensenia.edu.ar"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <div className="login-password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? (
              <span className="login-spinner" />
            ) : (
              <>
                <LogIn size={18} />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="login-demo">
          <p className="login-demo-title">Credenciales demo</p>
          <div className="login-demo-grid">
            <button type="button" className="login-demo-btn" onClick={() => { setEmail('marco.rossi@ensenia.edu.ar'); setPassword('demo123'); }}>
              <span className="demo-role">Docente</span>
              <span className="demo-name">Marco Rossi</span>
            </button>
            <button type="button" className="login-demo-btn" onClick={() => { setEmail('ana.martinez@ensenia.edu.ar'); setPassword('demo123'); }}>
              <span className="demo-role">Directora</span>
              <span className="demo-name">Ana Martínez</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
