import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, SESION_VENCIDA_KEY } from '../contexts/AuthContext';
import { esEquipoPersonal } from '../lib/equipoPersonal';
import { LogIn, Eye, EyeOff, AlertCircle, Feather, Accessibility, ShieldCheck, Clock } from 'lucide-react';
import LoginChalkboard from '../components/login/LoginChalkboard';
import LoginMascot from '../components/login/LoginMascot';
import type { MiguePose } from '../components/login/student-viewer';
import './Login.css';
import './LoginScene.css';

/**
 * Cuentas de demostración. Solo con VITE_DEMO_LOGIN=true: Vite reemplaza la
 * variable al compilar y, apagada, las contraseñas ni llegan al bundle (en
 * producción cualquiera las leía y entraba; una contraseña pública en la
 * pantalla de entrada no puede convivir con datos de chicos reales).
 */
const DEMO = [
  { rol: 'Docente', nombre: 'Marco Rossi', email: 'marco.rossi@ensenia.edu.ar', clase: 'demo-docente' },
  { rol: 'Dirección', nombre: 'Ana Martínez', email: 'ana.martinez@ensenia.edu.ar', clase: 'demo-direccion' },
  { rol: 'Estudiante', nombre: 'Sofía Ramírez', email: 'sofia.ramirez@estudiante.ensenia.edu.ar', clase: 'demo-estudiante' },
  { rol: 'Familia', nombre: 'Roberto Pérez', email: 'roberto.perez@familia.ensenia.edu.ar', clase: 'demo-familia' },
];

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [miguePose, setMiguePose] = useState<MiguePose>('neutral');
  const winkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (winkTimer.current) clearTimeout(winkTimer.current); }, []);
  function reactMigue(pose: MiguePose) {
    if (winkTimer.current) clearTimeout(winkTimer.current);
    setMiguePose(pose);
  }
  // Queda marcada si la última vez se marcó en este equipo
  const [equipoPersonal, setEquipoPersonal] = useState(() => esEquipoPersonal());
  // La sesión del personal vence a las 12 h (AuthContext): se explica una vez
  const [sesionVencida] = useState(() => {
    try { return sessionStorage.getItem(SESION_VENCIDA_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.removeItem(SESION_VENCIDA_KEY); } catch { /* noop */ }
  }, []);

  // Destino post-login: si vino de un QR (?next=/mis-actividades/...),
  // va derecho ahí; si no, a "/" y HomeRedirect resuelve según el rol.
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!isLoading && isAuthenticated) {
    return <Navigate to={next} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Completá tu usuario (email o DNI) y la contraseña.');
      return;
    }

    reactMigue('wink');
    winkTimer.current = setTimeout(() => setMiguePose('neutral'), 1300);
    setSubmitting(true);
    const result = await login(email, password, { equipoPersonal });
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || 'No pudimos iniciar la sesión.');
    }
    // Si sale bien, AuthContext carga el usuario y el <Navigate> de arriba redirige.
  }

  return (
    <div className="login-page">
      <main className="login-layout" data-migue-region>
        <LoginChalkboard />
        {/* ── Marca ── */}
        <section className="login-marca" aria-labelledby="login-titulo">
          {/* El logo de la ciudad, tal cual lo usa la Municipalidad (blanco sobre azul) */}
          <img className="login-ciudad" src="/Logo_SMT_blanco.png" width={507} height={206}
            alt="Ciudad de San Miguel de Tucumán" />
          <h1 className="login-title" id="login-titulo">SMT Estud<span>IA</span></h1>
          <p className="login-subtitle">La plataforma de las escuelas municipales de San Miguel de Tucumán.</p>


          <ul className="login-roles" aria-label="Quiénes la usan">
            <li className="rol-direccion">Dirección</li>
            <li className="rol-docente">Docentes</li>
            <li className="rol-estudiante">Estudiantes</li>
            <li className="rol-familia">Familias</li>
          </ul>

          <ul className="login-promesas">
            <li><Feather size={18} aria-hidden="true" /><span><strong>Liviana.</strong> Pensada para celulares con pocos datos. Lo que ya abriste sigue andando sin conexión.</span></li>
            <li><Accessibility size={18} aria-hidden="true" /><span><strong>Para todos.</strong> Letra grande, contraste alto y uso completo con teclado.</span></li>
            <li><ShieldCheck size={18} aria-hidden="true" /><span><strong>Sin publicidad ni rastreadores.</strong> Cada persona ve solo lo que le corresponde.</span></li>
          </ul>
        </section>

        <div className="login-access">
        {/* ── Formulario ── */}
        <section className="login-card" aria-labelledby="login-form-titulo"
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) reactMigue('neutral'); }}>
          <span className="login-eyebrow">TU ESCUELA, MÁS CERCA</span>
          <h2 className="login-form-titulo" id="login-form-titulo">Entrar</h2>
          <p className="login-form-bajada">Con el email y la contraseña que te dio la escuela.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {sesionVencida && !error && (
              <div className="login-aviso" role="status">
                <Clock size={16} aria-hidden="true" />
                <span>Tu sesión se cerró porque pasaron 12 horas desde que entraste. Volvé a entrar para seguir; si es tu equipo, marcá "Es mi equipo" y no se va a volver a cerrar sola.</span>
              </div>
            )}
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email">Email o DNI</label>
              {/* type="text": los estudiantes entran con el DNI (ver lib/dni.ts) */}
              <input
                id="email"
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Tu email, o tu DNI si sos estudiante"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!error && !email.trim()}
                onFocus={() => reactMigue('username')}
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
                  autoComplete="current-password"
                  onFocus={() => reactMigue(showPassword ? 'surprise' : 'password')}
                  aria-invalid={!!error && !password.trim()}
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => { setShowPassword(p => !p); reactMigue(showPassword ? 'password' : 'surprise'); }}
                  aria-label={showPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <label className="login-equipo">
              <input type="checkbox" checked={equipoPersonal} onChange={e => setEquipoPersonal(e.target.checked)} />
              <span>
                <strong>Es mi equipo</strong>
                <small>La sesión queda abierta y lo que prepares sigue acá sin conexión. En una compu compartida de la escuela, dejalo sin marcar.</small>
              </span>
            </label>

            <button type="submit" className="login-submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? (
                <><span className="login-spinner" aria-hidden="true" /><span>Entrando…</span></>
              ) : (
                <><LogIn size={18} aria-hidden="true" /> Entrar</>
              )}
            </button>
          </form>

          {import.meta.env.VITE_DEMO_LOGIN === 'true' && (
            <div className="login-demo">
              <p className="login-demo-title" id="login-demo-titulo">Probar con una cuenta de demostración</p>
              <ul className="login-demo-grid" aria-labelledby="login-demo-titulo">
                {DEMO.map(d => (
                  <li key={d.email}>
                    <button
                      type="button"
                      className={`login-demo-btn ${d.clase}`}
                      onClick={() => { setEmail(d.email); setPassword('demo123'); setError(''); }}
                    >
                      <span className="demo-role">{d.rol}</span>
                      <span className="demo-name">{d.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <LoginMascot pose={miguePose} />
        </div>
        <p className="login-school-footer">Municipalidad de San Miguel de Tucumán</p>
      </main>
    </div>
  );
}
