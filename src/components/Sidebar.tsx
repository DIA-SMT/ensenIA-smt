import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, Calendar, FlaskConical, Users, BookOpen,
    Bell, Settings, ChevronsLeft, ChevronsRight, LogOut, MessageSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

interface NavItem {
    label: string;
    path: string;
    icon: typeof LayoutDashboard;
    isIA?: boolean;
}

const teacherNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Mi Agenda', path: '/agenda', icon: Calendar },
    { label: 'Laboratorio IA', path: '/ia-lab', icon: FlaskConical, isIA: true },
    { label: 'Estudiantes', path: '/students', icon: Users },
    { label: 'Biblioteca Docente', path: '/biblioteca', icon: BookOpen },
    { label: 'Alertas', path: '/alerts', icon: Bell },
    { label: 'Configuración', path: '/settings', icon: Settings },
];

const directorNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Docentes', path: '/docentes', icon: Users },
    { label: 'Alertas', path: '/alerts', icon: Bell },
    { label: 'Comunicaciones', path: '/comunicaciones', icon: MessageSquare },
    { label: 'Configuración', path: '/settings', icon: Settings },
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
    const { user, isDirector, logout } = useAuth();

    const navItems = isDirector ? directorNavItems : teacherNavItems;

    const displayName = user ? `${user.firstName} ${user.lastName}` : '';
    const roleLabel = isDirector ? 'Directora' : 'Docente';
    const avatarInitials = user?.avatarInitials ?? '??';

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <LogoMark size={collapsed ? 22 : 28} />
                {!collapsed && (
                    <div className="logo-text">
                        <span className="logo-title">ENSEÑIA SMT</span>
                        <span className="logo-subtitle">Alfonsina Storni</span>
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
