import { User as UserIcon, Mail, School, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

export default function Settings() {
    const { user, school, logout } = useAuth();

    if (!user) return null;

    const roleLabel = user.role === 'director' ? 'Directora'
        : user.role === 'estudiante' ? 'Estudiante'
        : user.role === 'padre' ? 'Familia'
        : 'Docente';

    return (
        <div className="settings-container">
            {/* Profile Section */}
            <section className="card settings-section">
                <h3 className="settings-section-title">Perfil de Usuario</h3>

                <div className="settings-profile">
                    <div className="settings-avatar-wrap">
                        <div className="settings-avatar">{user.avatarInitials}</div>
                    </div>
                    <div className="settings-profile-info">
                        <h4 className="settings-profile-name">{user.firstName} {user.lastName}</h4>
                        <span className="settings-profile-role badge badge-cyan">{roleLabel}</span>
                    </div>
                </div>

                <div className="settings-fields">
                    <div className="settings-field">
                        <label><UserIcon size={14} /> Nombre completo</label>
                        <input type="text" value={`${user.firstName} ${user.lastName}`} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label><Mail size={14} /> Email</label>
                        <input type="text" value={user.email} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label><Shield size={14} /> Rol</label>
                        <input type="text" value={roleLabel} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label><School size={14} /> Institución</label>
                        <input type="text" value={school?.name ?? '-'} readOnly className="settings-input" />
                    </div>
                </div>
            </section>

            {/* Mis materias */}
            {user.subjects && user.subjects.length > 0 && (
                <section className="card settings-section">
                    <h3 className="settings-section-title">Mis materias</h3>
                    <p className="settings-session-hint">
                        Los cursos que tenés asignados. Si falta alguno, pedile a dirección que lo cargue.
                    </p>
                    <div className="settings-subjects">
                        {user.subjects.map((s, i) => (
                            <span key={i} className="settings-subject-chip">{s.courseName}</span>
                        ))}
                    </div>
                </section>
            )}

            {/* Session */}
            <section className="card settings-section">
                <h3 className="settings-section-title">Sesión</h3>
                <p className="settings-session-hint">
                    Conectado como <strong>{user.email}</strong>
                </p>
                <button className="btn btn-danger settings-logout-btn" onClick={logout}>
                    <LogOut size={16} />
                    Cerrar Sesión
                </button>
            </section>
        </div>
    );
}
