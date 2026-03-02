import { Monitor, Moon, Sun, Search, PlusCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './Topbar.css';

const routeNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/agenda': 'Mi Agenda',
    '/planner': 'Planificación',
    '/students': 'Estudiantes',
    '/evaluations': 'Evaluaciones',
    '/ia-lab': 'Laboratorio IA',
    '/materials': 'Materiales',
    '/alerts': 'Alertas',
    '/settings': 'Configuración',
    '/director': 'Panel Directivo'
};

export default function Topbar() {
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
    const location = useLocation();
    const pageTitle = routeNames[location.pathname] || 'Dashboard';

    const today = new Date().toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    const formattedDate = today.charAt(0).toUpperCase() + today.slice(1);

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            root.setAttribute('data-theme', systemTheme);
        } else {
            root.setAttribute('data-theme', theme);
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    return (
        <header className="topbar glass-panel">
            <div className="topbar-left">
                <div>
                    <h2 className="page-title">{pageTitle}</h2>
                    <div className="topbar-greeting">
                        <span>¡Buen día, Marco!</span>
                        <span className="dot-separator">•</span>
                        <span className="date-display">{formattedDate}</span>
                    </div>
                </div>
            </div>

            <div className="topbar-right">
                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Buscar alumnos, clases..." className="search-input" />
                </div>

                <button className="btn btn-outline theme-toggle" onClick={toggleTheme}>
                    {theme === 'light' ? <Moon size={18} /> : (theme === 'dark' ? <Sun size={18} /> : <Monitor size={18} />)}
                </button>

                <button className="btn btn-primary">
                    <PlusCircle size={18} />
                    Nueva Clase
                </button>
            </div>
        </header>
    );
}
