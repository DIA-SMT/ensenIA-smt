import { User as UserIcon, Mail, School, Shield, LogOut, Moon, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

export default function Settings() {
    const { user, school, isDirector, logout } = useAuth();

    if (!user) return null;

    const roleLabel = isDirector ? 'Directora' : 'Docente';

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

            {/* Preferences */}
            <section className="card settings-section">
                <h3 className="settings-section-title">Preferencias</h3>

                <div className="settings-pref-list">
                    <div className="settings-pref-item">
                        <div className="settings-pref-info">
                            <Moon size={16} />
                            <div>
                                <span className="settings-pref-label">Tema oscuro</span>
                                <span className="settings-pref-desc">Activado por defecto</span>
                            </div>
                        </div>
                        <div className="settings-toggle active">
                            <div className="settings-toggle-knob" />
                        </div>
                    </div>

                    <div className="settings-pref-item">
                        <div className="settings-pref-info">
                            <Bell size={16} />
                            <div>
                                <span className="settings-pref-label">Notificaciones</span>
                                <span className="settings-pref-desc">Recibir alertas y comunicados</span>
                            </div>
                        </div>
                        <div className="settings-toggle active">
                            <div className="settings-toggle-knob" />
                        </div>
                    </div>
                </div>
            </section>

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
