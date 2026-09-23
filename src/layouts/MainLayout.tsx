/**
 * Armazón de la app: barra lateral (escritorio), barra superior, contenido
 * y barra inferior (celular). También:
 *
 *   - pone el rol en <html> para que toda la app tome su color;
 *   - "Saltar al contenido" para quien navega con teclado;
 *   - al cambiar de pantalla, actualiza el título de la pestaña, lleva el
 *     foco al contenido y lo anuncia al lector de pantalla (en una app de
 *     una sola página, si no se hace, el lector no se entera del cambio);
 *   - Ctrl K / ⌘K abre el buscador desde cualquier lado;
 *   - anticipa las pantallas del rol para que anden sin conexión, salvo con
 *     ahorro de datos.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import OfflineBanner from '../components/OfflineBanner';
import BarraInferior from '../components/shell/BarraInferior';
import Buscador from '../components/shell/Buscador';
import Dialogo from '../components/shell/Dialogo';
import PanelPreferencias from '../components/shell/PanelPreferencias';
import LimitePantalla from '../components/shell/LimitePantalla';
import { useAuth } from '../contexts/AuthContext';
import { usePreferencias } from '../contexts/PreferencesContext';
import { NAV_POR_ROL, tituloDe } from '../lib/navegacion';
import { anticipar, type RutaPantalla } from '../lib/pantallas';
import { startOfflineSync } from '../services/offline-queue.service';
import { asegurarPantallasOffline } from '../lib/guardarOffline';
import '../components/shell/shell.css';
import './MainLayout.css';

/** Pantallas de detalle que conviene tener a mano sin conexión. */
const DETALLES_POR_ROL: Partial<Record<string, RutaPantalla[]>> = {
  estudiante: ['/mis-actividades/:id'],
  // Actividad rápida es una acción, no está en el menú, pero es lo que el
  // docente más usa desde el celular: tiene que andar sin conexión.
  docente: ['/actividades/:id', '/actividad-rapida'],
  director: ['/cursos/:id'],
};

export default function MainLayout() {
  const { user } = useAuth();
  const { ahorroActivo } = usePreferencias();
  const { pathname } = useLocation();
  const [buscando, setBuscando] = useState(false);
  const [prefsAbiertas, setPrefsAbiertas] = useState(false);
  const anuncioRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const rutaPrevia = useRef<string | null>(null);

  // La cola offline arranca una sola vez con la app
  useEffect(() => { startOfflineSync(); asegurarPantallasOffline(); }, []);

  // El color del rol, antes de pintar.
  useLayoutEffect(() => {
    if (!user) return;
    const raiz = document.documentElement;
    raiz.dataset.rol = user.role;
    return () => { delete raiz.dataset.rol; };
  }, [user]);

  // Cambio de pantalla: título, foco y anuncio.
  const titulo = tituloDe(user?.role, pathname);
  useEffect(() => {
    document.title = `${titulo} · SMT EstudIA`;
    // Solo cuando cambia la RUTA: el título también cambia al terminar de
    // cargar el perfil, y eso no es navegar. La primera pantalla y la
    // redirección desde "/" tampoco mueven el foco: así el primer Tab sigue
    // yendo a "Saltar al contenido".
    const previa = rutaPrevia.current;
    rutaPrevia.current = pathname;
    if (previa === null || previa === pathname || previa === '/') return;
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo({ top: 0 });
    // La región viva se escribe directo: es un canal hacia el lector de
    // pantalla, no estado de React.
    if (anuncioRef.current) anuncioRef.current.textContent = `Pantalla: ${titulo}`;
  }, [pathname, titulo]);

  // Ctrl K / ⌘K
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscando(true);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Las pantallas del rol, por adelantado y sin apuro.
  useEffect(() => {
    if (!user || ahorroActivo) return;
    const rutas = [...NAV_POR_ROL[user.role].map(i => i.ruta), ...(DETALLES_POR_ROL[user.role] ?? [])];
    anticipar(rutas);
  }, [user, ahorroActivo]);

  const abrirPreferencias = useCallback(() => setPrefsAbiertas(true), []);
  const cerrarBuscador = useCallback(() => setBuscando(false), []);
  const cerrarPreferencias = useCallback(() => setPrefsAbiertas(false), []);

  return (
    <div className="layout-container">
      <a href="#contenido" className="skip-link">Saltar al contenido</a>

      <Sidebar alAbrirPreferencias={abrirPreferencias} />

      <div className="main-wrapper">
        <Topbar alBuscar={() => setBuscando(true)} alAbrirPreferencias={abrirPreferencias} />
        <OfflineBanner />
        <main id="contenido" className="main-content" ref={mainRef} tabIndex={-1} aria-label={titulo}>
          <LimitePantalla key={pathname}>
            <Outlet />
          </LimitePantalla>
        </main>
        <BarraInferior alAbrirPreferencias={abrirPreferencias} />
      </div>

      <Buscador abierto={buscando} alCerrar={cerrarBuscador} />

      <Dialogo abierto={prefsAbiertas} alCerrar={cerrarPreferencias} etiquetadoPor="prefs-titulo" className="dialogo-panel">
        <div className="dialogo-encabezado">
          <h2 id="prefs-titulo">Accesibilidad y datos</h2>
          <button type="button" className="btn-icon" onClick={cerrarPreferencias} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="dialogo-bajada">Se guarda en este dispositivo. Si compartís la compu, no le cambia nada a nadie más.</p>
        <PanelPreferencias primerFoco />
      </Dialogo>

      {/* Anuncio de cambio de pantalla para el lector. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" ref={anuncioRef} />
    </div>
  );
}
