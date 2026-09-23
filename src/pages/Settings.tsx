import { User as UserIcon, Mail, School, Shield, LogOut, Accessibility, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ETIQUETA_ROL } from '../lib/navegacion';
import PanelPreferencias from '../components/shell/PanelPreferencias';
import './Settings.css';

/**
 * Ajustes. Antes mostraba dos interruptores que no hacían nada (uno decía
 * "Tema oscuro — activado por defecto" con la app en claro). Ahora cada
 * control hace lo que dice.
 */
export default function Settings() {
    const { user, school, logout } = useAuth();

    if (!user) return null;

    const roleLabel = ETIQUETA_ROL[user.role];

    return (
        <div className="settings-container">
            <section className="card settings-section" aria-labelledby="ajustes-perfil">
                <h2 className="settings-section-title" id="ajustes-perfil">Tu cuenta</h2>

                <div className="settings-profile">
                    <div className="settings-avatar-wrap">
                        <div className="settings-avatar" aria-hidden="true">{user.avatarInitials}</div>
                    </div>
                    <div className="settings-profile-info">
                        <p className="settings-profile-name">{user.firstName} {user.lastName}</p>
                        <span className="settings-profile-role badge badge-cyan">{roleLabel}</span>
                    </div>
                </div>

                <div className="settings-fields">
                    <div className="settings-field">
                        <label htmlFor="aj-nombre"><UserIcon size={14} aria-hidden="true" /> Nombre completo</label>
                        <input id="aj-nombre" type="text" value={`${user.firstName} ${user.lastName}`} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="aj-email"><Mail size={14} aria-hidden="true" /> Email</label>
                        <input id="aj-email" type="text" value={user.email} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="aj-rol"><Shield size={14} aria-hidden="true" /> Rol</label>
                        <input id="aj-rol" type="text" value={roleLabel} readOnly className="settings-input" />
                    </div>
                    <div className="settings-field">
                        <label htmlFor="aj-escuela"><School size={14} aria-hidden="true" /> Escuela</label>
                        <input id="aj-escuela" type="text" value={school?.name ?? '-'} readOnly className="settings-input" />
                    </div>
                </div>
            </section>

            <section className="card settings-section" aria-labelledby="ajustes-lectura">
                <div>
                    <h2 className="settings-section-title" id="ajustes-lectura">
                        <Accessibility size={18} aria-hidden="true" /> Accesibilidad y datos
                    </h2>
                    <p className="settings-section-desc">
                        Se guarda en este dispositivo. Si compartís la compu de la escuela, no le cambia nada a nadie más.
                    </p>
                </div>
                <PanelPreferencias />
            </section>

            <section className="card settings-section" aria-labelledby="ajustes-sesion">
                <h2 className="settings-section-title" id="ajustes-sesion">
                    <ShieldCheck size={18} aria-hidden="true" /> Sesión
                </h2>
                <p className="settings-session-hint">
                    Conectado como <strong>{user.email}</strong>. Al cerrar sesión se borra de este
                    dispositivo lo que la app guardó para usar sin conexión.
                </p>
                <button type="button" className="btn btn-danger settings-logout-btn" onClick={logout}>
                    <LogOut size={16} aria-hidden="true" />
                    Cerrar sesión
                </button>
            </section>
        </div>
    );
}
