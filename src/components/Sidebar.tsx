/**
 * Barra lateral (escritorio y tablet horizontal).
 *
 * Agrupada por lo que la persona hace ("Mi día", "Aula", "Escuela"), no
 * por módulo. Arriba de todo, quién tiene la sesión abierta y de qué
 * escuela, con el color del rol: en una compu compartida se ve al instante.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LogOut, Accessibility } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { NAV_POR_ROL, ETIQUETA_ROL, itemActivo, inicioDe } from '../lib/navegacion';
import { getUnreadAlertCount, getEscaladasPendientes } from '../services/alerts.service';
import { getCommunicationsBySchool, sinLeer, EVENTO_COMUNICADO_LEIDO } from '../services/communications.service';
import { getMyLiveSession } from '../services/live.service';
import './Sidebar.css';

const CLAVE_COLAPSADA = 'estudia_barra_colapsada';

/** id válido para aria-labelledby: sin espacios ni tildes. */
const idGrupo = (g: string) => 'nav-g-' + g.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * El isologo de la Municipalidad (las dos hojas y el punto amarillo), el
 * mismo de los íconos de la app. Es el original: no se redibuja ni se tiñe
 * con el color del rol. public/isologo.png es transparente, sacado del
 * ícono de 512 conservando sus tres colores exactos.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/isologo.png" width={size} height={size} alt="" aria-hidden="true" className="logo-mark" />;
}

interface SidebarProps {
  alAbrirPreferencias: () => void;
}

export default function Sidebar({ alAbrirPreferencias }: SidebarProps) {
  const { user, school, logout } = useAuth();
  const { pathname } = useLocation();
  const [colapsada, setColapsada] = useState(() => {
    try { return localStorage.getItem(CLAVE_COLAPSADA) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(CLAVE_COLAPSADA, colapsada ? '1' : '0'); } catch { /* sin storage */ }
    document.documentElement.dataset.barra = colapsada ? 'colapsada' : 'abierta';
  }, [colapsada]);

  const userId = user?.id;
  const schoolId = user?.schoolId;
  const isDocente = user?.role === 'docente';
  const isDirector = user?.role === 'director';
  const [alertCount, setAlertCount] = useState(0);
  const [comunicadosSinLeer, setComunicadosSinLeer] = useState(0);
  const [paraDireccion, setParaDireccion] = useState(0);
  const [liveNow, setLiveNow] = useState(false);

  // Los números del menú se actualizan solos cada 2 minutos: un alumno que
  // pide hablar, un docente que avisa a dirección o un comunicado nuevo
  // tienen que verse sin cerrar sesión (051).
  useEffect(() => {
    if (!userId || !schoolId || (!isDocente && !isDirector)) return;
    let alive = true;
    const contar = () => {
      if (isDocente) {
        getUnreadAlertCount(userId).then(n => { if (alive) setAlertCount(n); }).catch(() => {});
        getCommunicationsBySchool(schoolId)
          .then(c => { if (alive) setComunicadosSinLeer(sinLeer(c, userId).length); })
          .catch(() => {});
      } else {
        getEscaladasPendientes(schoolId).then(n => { if (alive) setParaDireccion(n); }).catch(() => {});
      }
    };
    contar();
    const id = window.setInterval(contar, 120_000);
    window.addEventListener(EVENTO_COMUNICADO_LEIDO, contar);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener(EVENTO_COMUNICADO_LEIDO, contar); };
  }, [userId, schoolId, isDocente, isDirector]);

  // Una sesión abierta y olvidada bloquea al curso (hay un único índice de
  // "una clase viva por curso"), así que el punto rojo no es adorno: es cómo
  // te enterás de que la dejaste prendida. Cada 30s alcanza — el que está
  // dando la clase ya tiene el panel polleando cada 2,5s.
  useEffect(() => {
    if (!userId || !isDocente) return;
    let alive = true;
    const check = () => {
      getMyLiveSession(userId)
        .then(s => { if (alive) setLiveNow(!!s); })
        .catch(() => {});
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [userId, isDocente]);

  if (!user) return null;

  const items = NAV_POR_ROL[user.role];
  const grupos = [...new Set(items.map(i => i.grupo))];
  const activo = itemActivo(user.role, pathname);
  const nombre = `${user.firstName} ${user.lastName}`;

  // Contador de alertas sin ver: sobre "Alertas" si el menú la tiene; si no,
  // sobre la lista de personas que la genera (Estudiantes / Docentes).
  const rutaAlertas = items.some(i => i.ruta === '/alerts') ? '/alerts'
    : user.role === 'docente' ? '/students' : null;
  const insignias = (ruta: string) => (
    <>
      {isDocente && ruta === rutaAlertas && alertCount > 0 && (
        <span className="nav-alert-badge" title={`${alertCount} alertas sin ver`}>{alertCount}</span>
      )}
      {isDocente && ruta === '/comunicados' && comunicadosSinLeer > 0 && (
        <span className="nav-alert-badge" title={`${comunicadosSinLeer} comunicados sin leer`}>{comunicadosSinLeer}</span>
      )}
      {isDirector && ruta === '/alerts' && paraDireccion > 0 && (
        <span className="nav-alert-badge" title={`${paraDireccion} avisos para dirección sin cerrar`}>{paraDireccion}</span>
      )}
      {isDocente && ruta === '/clase-en-vivo' && liveNow && (
        <span className="nav-live-dot" title="Tenés una clase en vivo abierta" />
      )}
    </>
  );

  return (
    <aside className={`sidebar${colapsada ? ' collapsed' : ''}`} aria-label="Menú lateral">
      {/* La marca lleva al inicio de cada rol, como en cualquier sitio */}
      <Link to={inicioDe(user.role)} className="sidebar-header" aria-label="Ir al inicio" title="Ir al inicio">
        <LogoMark size={colapsada ? 22 : 26} />
        <div className="logo-text">
          <span className="logo-title">SMT Estud<span className="logo-ia">IA</span></span>
          <span className="logo-subtitle">{school?.shortName ?? (user.role === 'superadmin' ? 'Administración' : 'Escuela municipal')}</span>
        </div>
      </Link>

      <div className="sidebar-quien" title={colapsada ? `${nombre} · ${ETIQUETA_ROL[user.role]}` : undefined}>
        <div className="avatar" aria-hidden="true">{user.avatarInitials}</div>
        <div className="user-info">
          <span className="user-name">{nombre}</span>
          <span className="user-role">{ETIQUETA_ROL[user.role]}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Principal">
        {grupos.filter(g => g !== 'Cuenta').map(g => (
          <div className="nav-grupo" key={g}>
            <h2 className="nav-grupo-titulo" id={idGrupo(g)}>{g}</h2>
            <ul aria-labelledby={idGrupo(g)}>
              {items.filter(i => i.grupo === g).map(i => {
                const esActivo = activo === i.ruta;
                return (
                  <li key={i.ruta}>
                    <Link
                      to={i.ruta}
                      className={`nav-item${esActivo ? ' active' : ''}${i.ia ? ' nav-ia' : ''}`}
                      aria-current={esActivo ? 'page' : undefined}
                      title={colapsada ? i.etiqueta : undefined}
                    >
                      <span className={`nav-icon-wrap${i.imagen ? ' nav-avatar-wrap' : ''}`}>
                        {i.imagen
                          ? <img src={i.imagen} alt="" className="nav-avatar" aria-hidden="true" />
                          : <i.icono size={19} aria-hidden="true" />}
                      </span>
                      <span className="nav-label">{i.etiqueta}</span>
                      {i.ia && <span className="ia-tag" aria-hidden="true">IA</span>}
                      {insignias(i.ruta)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {items.filter(i => i.grupo === 'Cuenta').map(i => (
          <Link
            key={i.ruta}
            to={i.ruta}
            className={`nav-item${activo === i.ruta ? ' active' : ''}`}
            aria-current={activo === i.ruta ? 'page' : undefined}
            title={colapsada ? i.etiqueta : undefined}
          >
            <span className="nav-icon-wrap"><i.icono size={19} aria-hidden="true" /></span>
            <span className="nav-label">{i.etiqueta}</span>
          </Link>
        ))}
        <button type="button" className="nav-item" onClick={alAbrirPreferencias} aria-haspopup="dialog" title={colapsada ? 'Accesibilidad y datos' : undefined}>
          <span className="nav-icon-wrap"><Accessibility size={19} aria-hidden="true" /></span>
          <span className="nav-label">Accesibilidad y datos</span>
        </button>
        <div className="sidebar-footer-fila">
          <button type="button" className="nav-item nav-salir" onClick={logout} title={colapsada ? 'Cerrar sesión' : undefined}>
            <span className="nav-icon-wrap"><LogOut size={19} aria-hidden="true" /></span>
            <span className="nav-label">Cerrar sesión</span>
          </button>
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setColapsada(c => !c)}
            aria-expanded={!colapsada}
            aria-label={colapsada ? 'Mostrar el menú completo' : 'Achicar el menú'}
            title={colapsada ? 'Mostrar el menú completo' : 'Achicar el menú'}
          >
            {colapsada ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
