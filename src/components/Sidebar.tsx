import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, CalendarDays, Users, FileSignature, FlaskConical, BookOpen, Bell, Settings } from 'lucide-react';
import './Sidebar.css';

const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Mi Agenda', path: '/agenda', icon: Calendar },
    { label: 'Planificación', path: '/planner', icon: CalendarDays },
    { label: 'Estudiantes', path: '/students', icon: Users },
    { label: 'Evaluaciones', path: '/evaluations', icon: FileSignature },
    { label: 'Laboratorio IA', path: '/ia-lab', icon: FlaskConical },
    { label: 'Materiales', path: '/materials', icon: BookOpen },
    { label: 'Alertas', path: '/alerts', icon: Bell },
    { label: 'Configuración', path: '/settings', icon: Settings },
];

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="logo-placeholder">AM</div>
                <h1 className="sidebar-title">Aula Municipal</h1>
            </div>
            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                        <item.icon className="nav-icon" size={20} />
                        <span className="nav-label">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="user-profile">
                    <div className="avatar">DR</div>
                    <div className="user-info">
                        <span className="user-name">Docente Rossi</span>
                        <span className="user-role">Secundaria</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
