import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, Calendar, Users, BookOpen,
    Settings, ChevronsLeft, ChevronsRight, LogOut, MessageSquare,
    ClipboardList, HeartHandshake, GraduationCap, Megaphone, Sparkles, Radio, Sun, Boxes, Activity
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUnreadAlertCount } from '../services/alerts.service';
import { getMyLiveSession } from '../services/live.service';
import './Sidebar.css';

interface NavItem {
    label: string;
    path: string;
    icon: typeof LayoutDashboard;
    isIA?: boolean;
    /** Muestra el contador de alertas sin abrir (Alertas dejó de ser sección). */
    showAlerts?: boolean;
    /** Muestra el punto rojo cuando hay una clase en vivo abierta. */
    showLive?: boolean;
}

// Destinos con nombres de aula y no de sistema. Preparar clase y crear
// actividad siguen siendo botones de acción que viven en Hoy: el docente
// llega a ellos desde su clase del día.
//
// Clase en vivo es la excepción y tiene su item: colgaba de la tarjeta de
// la clase de hoy, y esa tarjeta se atenúa cuando pasó el horario. Para
// una jornada, una presentación o cualquier momento que no sea tu clase
// de las 8, había que ir a buscarlo a un botón que parecía apagado.
const teacherNavItems: NavItem[] = [
    { label: 'Hoy', path: '/hoy', icon: Sun },
    { label: 'Clase en vivo', path: '/clase-en-vivo', icon: Radio, showLive: true },
    { label: 'Armar módulo', path: '/modulo', icon: Boxes, isIA: true },
    { label: 'Mis clases', path: '/mis-clases', icon: Calendar },
    { label: 'Estudiantes', path: '/students', icon: Users, showAlerts: true },
    { label: 'Familias', path: '/familias', icon: HeartHandshake },
    { label: 'Ajustes', path: '/settings', icon: Settings },
];

const directorNavItems: NavItem[] = [
    { label: 'Qué está pasando', path: '/panel', icon: Activity },
    { label: 'Docentes', path: '/docentes', icon: Users, showAlerts: true },
    { label: 'Familias', path: '/familias', icon: HeartHandshake },
    { label: 'Comunicaciones', path: '/comunicaciones', icon: MessageSquare },
    { label: 'Ajustes', path: '/settings', icon: Settings },
];

const studentNavItems: NavItem[] = [
    { label: 'Mi escuela', path: '/mis-actividades', icon: ClipboardList },
    { label: 'Clase en vivo', path: '/clase', icon: Radio },
    { label: 'Mi guía IA', path: '/mi-guia', icon: Sparkles, isIA: true },
    { label: 'Mis materiales', path: '/mi-biblioteca', icon: BookOpen },
    { label: 'Ajustes', path: '/settings', icon: Settings },
];

const guardianNavItems: NavItem[] = [
    { label: 'Cómo le va', path: '/mis-hijos', icon: GraduationCap },
    { label: 'Comunicados', path: '/comunicados-familia', icon: Megaphone },
    { label: 'Ajustes', path: '/settings', icon: Settings },
];

function LogoMark({ size = 28 }: { size?: number }) {
    return (
        <svg width={size} height={size * 1.2} viewBox="0 0 40 48" fill="none">
            <defs>
                <linearGradient id="leaf-g" x1="20" y1="46" x2="20" y2="6" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#005FA3" />
                    <stop offset="0.45" stopColor="#00A8FF" />
                    <stop offset="1" stopColor="#7BC8F4" />
                </linearGradient>
            </defs>
            <path d="M20 46C20 46 3 30 3 19C3 12 8 7 14 9.5C17 10.5 19 13 20 16C21 13 23 10.5 26 9.5C32 7 37 12 37 19C37 30 20 46 20 46Z" fill="url(#leaf-g)" />
            <circle cx="20" cy="5" r="4.5" fill="#FCD34D" />
        </svg>
    );
}

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const { user, school, isDirector, isEstudiante, logout } = useAuth();
    const isPadre = user?.role === 'padre';
    const [alertCount, setAlertCount] = useState(0);

    const isDocente = user?.role === 'docente';
    const [liveNow, setLiveNow] = useState(false);

    useEffect(() => {
        if (!user || !isDocente) return;
        getUnreadAlertCount(user.id).then(setAlertCount).catch(() => {});
    }, [user?.id, isDocente]);

    // Una sesión abierta y olvidada bloquea al curso (hay un único índice
    // de "una clase viva por curso"), así que el punto rojo no es adorno:
    // es cómo te enterás de que la dejaste prendida. Cada 30s alcanza —
    // el que está dando la clase ya tiene el panel polleando cada 2,5s.
    useEffect(() => {
        if (!user || !isDocente) return;
        let alive = true;
        const check = () => {
            getMyLiveSession(user.id)
                .then(s => { if (alive) setLiveNow(!!s); })
                .catch(() => {});
        };
        check();
        const id = window.setInterval(check, 30_000);
        return () => { alive = false; window.clearInterval(id); };
    }, [user?.id, isDocente]);

    const navItems = isDirector ? directorNavItems
        : isEstudiante ? studentNavItems
        : isPadre ? guardianNavItems
        : teacherNavItems;

    const displayName = user ? `${user.firstName} ${user.lastName}` : '';
    const roleLabel = isDirector ? 'Directora' : isEstudiante ? 'Estudiante' : isPadre ? 'Familia' : 'Docente';
    const avatarInitials = user?.avatarInitials ?? '??';

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <LogoMark size={collapsed ? 22 : 28} />
                {!collapsed && (
                    <div className="logo-text">
                        <span className="logo-title">SMT EstudIA</span>
                        <span className="logo-subtitle">{school?.shortName ?? 'Escuela Municipal'}</span>
                    </div>
                )}
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `nav-item ${isActive ? 'active' : ''} ${item.isIA ? 'nav-ia' : ''}`
                        }
                        title={collapsed ? item.label : undefined}
                    >
                        <div className="nav-icon-wrap">
                            <item.icon size={20} />
                        </div>
                        {!collapsed && <span className="nav-label">{item.label}</span>}
                        {!collapsed && item.isIA && <span className="ia-tag">IA</span>}
                        {item.showAlerts && alertCount > 0 && (
                            <span className="nav-alert-badge" title={`${alertCount} alertas sin ver`}>
                                {alertCount}
                            </span>
                        )}
                        {item.showLive && liveNow && (
                            <span className="nav-live-dot" title="Tenés una clase en vivo abierta" />
                        )}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-profile" title={collapsed ? displayName : undefined}>
                    <div className="avatar-glow"><div className="avatar">{avatarInitials}</div></div>
                    {!collapsed && (
                        <div className="user-info">
                            <span className="user-name">{displayName}</span>
                            <span className="user-role">{roleLabel}</span>
                        </div>
                    )}
                </div>
                {!collapsed && (
                    <button
                        className="collapse-btn logout-btn"
                        onClick={logout}
                        title="Cerrar sesión"
                    >
                        <LogOut size={16} />
                    </button>
                )}
                <button className="collapse-btn" onClick={onToggle} title={collapsed ? 'Expandir' : 'Colapsar'}>
                    {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
                </button>
            </div>
        </aside>
    );
}
