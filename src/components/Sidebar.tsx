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
import { NAV_POR_ROL, ETIQUETA_ROL, itemActivo } from '../lib/navegacion';
import './Sidebar.css';

const CLAVE_COLAPSADA = 'estudia_barra_colapsada';

/** id válido para aria-labelledby: sin espacios ni tildes. */
const idGrupo = (g: string) => 'nav-g-' + g.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 40 48" fill="none" aria-hidden="true" focusable="false">
      <path d="M20 46C20 46 3 30 3 19C3 12 8 7 14 9.5C17 10.5 19 13 20 16C21 13 23 10.5 26 9.5C32 7 37 12 37 19C37 30 20 46 20 46Z" fill="var(--acento)" />
      <path d="M20 46C20 46 3 30 3 19C3 12 8 7 14 9.5C17 10.5 19 13 20 16Z" fill="#FFFFFF" opacity="0.18" />
      <circle cx="20" cy="5" r="4.5" fill="#F5B82E" />
    </svg>
  );
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

  if (!user) return null;

  const items = NAV_POR_ROL[user.role];
  const grupos = [...new Set(items.map(i => i.grupo))];
  const activo = itemActivo(user.role, pathname);
  const nombre = `${user.firstName} ${user.lastName}`;

  return (
    <aside className={`sidebar${colapsada ? ' collapsed' : ''}`} aria-label="Menú lateral">
      <div className="sidebar-header">
        <LogoMark size={colapsada ? 22 : 26} />
        <div className="logo-text">
          <span className="logo-title">SMT Estud<span className="logo-ia">IA</span></span>
          <span className="logo-subtitle">{school?.shortName ?? 'Escuela municipal'}</span>
        </div>
      </div>

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
                      <span className="nav-icon-wrap"><i.icono size={19} aria-hidden="true" /></span>
                      <span className="nav-label">{i.etiqueta}</span>
                      {i.ia && <span className="ia-tag" aria-hidden="true">IA</span>}
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
