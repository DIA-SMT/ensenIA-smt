import { Search, Zap, Command, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import './Topbar.css';

const routeNames: Record<string, string> = {
    '/hoy': 'Hoy',
    '/mis-clases': 'Mis clases',
    '/crear': 'Crear actividad',
    '/asistencia': 'Asistencia',
    '/corregir': 'Para corregir',
    '/clase-en-vivo': 'Clase en vivo',
    '/dashboard': 'Dashboard',
    '/agenda': 'Mi horario',
    '/ia-lab': 'Preparar clase',
    '/students': 'Estudiantes',
    '/biblioteca': 'Mis materiales',
    '/alerts': 'Alertas',
    '/settings': 'Ajustes',
    '/docentes': 'Equipo Docente',
    '/comunicaciones': 'Comunicaciones',
    '/actividades': 'Actividades',
    '/mis-actividades': 'Mis Actividades',
    '/mi-biblioteca': 'Biblioteca',
    '/familias': 'Familias',
    '/comunicados-familia': 'Comunicados',
    '/mis-hijos': 'Mis Hijos',
    '/actividad-rapida': 'Crear actividad',
};

function titleFor(pathname: string): string {
    if (routeNames[pathname]) return routeNames[pathname];
    if (pathname.startsWith('/actividades/')) return 'Resultados de actividad';
    if (pathname.startsWith('/mis-actividades/')) return 'Actividad';
    return 'SMT EstudIA';
}

interface TopbarProps {
    onMenuClick?: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isDocente } = useAuth();

    const pageTitle = titleFor(location.pathname);

    const today = new Date().toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 12) return 'Buenos días';
        if (h < 18) return 'Buenas tardes';
        return 'Buenas noches';
    })();

    const firstName = user?.firstName ?? '';

    return (
        <header className="topbar glass-panel">
            <div className="topbar-left">
                <button className="btn-icon topbar-menu-btn" onClick={onMenuClick} aria-label="Abrir menú">
                    <Menu size={20} />
                </button>
                <h2 className="page-title">{pageTitle}</h2>
                <div className="topbar-greeting">
                    <span>{greeting}, {firstName}</span>
                    <span className="dot-sep">·</span>
                    <span className="date-display">{formattedDate}</span>
                </div>
            </div>

            <div className="topbar-right">
                <div className="search-trigger">
                    <Search size={16} className="search-trigger-icon" />
                    <span className="search-trigger-text">Buscar...</span>
                    <kbd className="search-kbd"><Command size={11} />K</kbd>
                </div>

                <NotificationDropdown />

                {isDocente && (
                    <button
                        className="btn btn-primary nueva-clase-btn"
                        onClick={() => navigate('/crear')}
                        title="Crear y publicar una actividad en un minuto"
                    >
                        <Zap size={18} />
                        <span>Crear actividad</span>
                    </button>
                )}
            </div>
        </header>
    );
}
