import { Search, PlusCircle, Command } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import './Topbar.css';

const routeNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/agenda': 'Mi Agenda',
    '/ia-lab': 'Laboratorio IA',
    '/students': 'Estudiantes',
    '/biblioteca': 'Biblioteca Docente',
    '/alerts': 'Alertas',
    '/settings': 'Configuración',
    '/docentes': 'Equipo Docente',
    '/comunicaciones': 'Comunicaciones',
};

export default function Topbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isDocente } = useAuth();

    const pageTitle = routeNames[location.pathname] || 'Dashboard';

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
                        onClick={() => navigate('/ia-lab')}
                    >
                        <PlusCircle size={18} />
                        <span>Nueva Clase</span>
                    </button>
                )}
            </div>
        </header>
    );
}
