/**
 * Barra superior: dónde estoy (título de la pantalla, que es el <h1>),
 * buscar o ir a cualquier lado, ajustes de lectura, avisos y, para el
 * docente, la actividad rápida.
 */

import { Search, Zap, Accessibility } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { tituloDe } from '../lib/navegacion';
import NotificationDropdown from './NotificationDropdown';
import { LogoMark } from './Sidebar';
import './Topbar.css';

interface TopbarProps {
  alBuscar: () => void;
  alAbrirPreferencias: () => void;
}

const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Topbar({ alBuscar, alAbrirPreferencias }: TopbarProps) {
  const { pathname } = useLocation();
  const { user, isDocente } = useAuth();

  const titulo = tituloDe(user?.role, pathname);
  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo" aria-hidden="true"><LogoMark size={20} /></span>
        <div className="topbar-titulos">
          <p className="topbar-greeting">
            <span>{saludo()}{user?.firstName ? `, ${user.firstName}` : ''}</span>
            <span className="dot-sep" aria-hidden="true">·</span>
            <span className="date-display">{hoy}</span>
          </p>
          <h1 className="page-title">{titulo}</h1>
        </div>
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="search-trigger"
          onClick={alBuscar}
          aria-haspopup="dialog"
          aria-keyshortcuts={esMac ? 'Meta+K' : 'Control+K'}
          aria-label="Buscar o ir a"
        >
          <Search size={17} className="search-trigger-icon" aria-hidden="true" />
          <span className="search-trigger-text" aria-hidden="true">Buscar o ir a…</span>
          <kbd className="search-kbd" aria-hidden="true">{esMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>

        <button
          type="button"
          className="btn-icon topbar-prefs"
          onClick={alAbrirPreferencias}
          aria-haspopup="dialog"
          aria-label="Accesibilidad y datos"
          title="Accesibilidad y datos"
        >
          <Accessibility size={19} aria-hidden="true" />
        </button>

        <NotificationDropdown />

        {isDocente && (
          <Link to="/actividad-rapida" className="btn btn-primary nueva-clase-btn" title="Crear y publicar una actividad en un minuto">
            <Zap size={17} aria-hidden="true" />
            <span>Actividad rápida</span>
          </Link>
        )}
      </div>
    </header>
  );
}
