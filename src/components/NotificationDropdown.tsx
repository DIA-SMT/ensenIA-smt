/**
 * Avisos de la barra superior.
 *
 * El botón dice cuántos hay sin leer también para el lector de pantalla
 * ("Avisos, 3 sin leer"), el panel se abre y se cierra con teclado
 * (Escape devuelve el foco al botón) y cada aviso es un botón de verdad:
 * antes eran recuadros que solo respondían al mouse.
 */

import { useState, useRef, useEffect, useId } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationDropdown.css';

const priorityColors: Record<string, string> = {
    high: 'badge-danger',
    medium: 'badge-warning',
    low: 'badge-neutral',
};

const priorityLabels: Record<string, string> = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
};

export default function NotificationDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const botonRef = useRef<HTMLButtonElement>(null);
    const idPanel = useId();
    const idTitulo = useId();
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

    // Cerrar al tocar afuera o con Escape (y devolver el foco al botón).
    useEffect(() => {
        if (!isOpen) return;
        function alTocarAfuera(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
        }
        function alTeclear(e: KeyboardEvent) {
            if (e.key === 'Escape') { setIsOpen(false); botonRef.current?.focus(); }
        }
        document.addEventListener('mousedown', alTocarAfuera);
        document.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('mousedown', alTocarAfuera);
            document.removeEventListener('keydown', alTeclear);
        };
    }, [isOpen]);

    const nombreBoton = unreadCount > 0
        ? `Avisos, ${unreadCount} sin leer`
        : 'Avisos, ninguno sin leer';

    return (
        <div className="notif-dropdown-container" ref={dropdownRef}>
            <button
                ref={botonRef}
                type="button"
                className="btn-icon notif-btn"
                aria-label={nombreBoton}
                aria-expanded={isOpen}
                aria-controls={isOpen ? idPanel : undefined}
                title="Avisos"
                onClick={() => setIsOpen(prev => !prev)}
            >
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="notif-dot" aria-hidden="true">
                        <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </span>
                )}
            </button>

            {isOpen && (
                <section id={idPanel} className="notif-dropdown card" aria-labelledby={idTitulo}>
                    <div className="notif-dropdown-header">
                        <h2 id={idTitulo} className="notif-dropdown-titulo">Avisos</h2>
                        {unreadCount > 0 && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={markAllAsRead}>
                                <CheckCheck size={14} aria-hidden="true" />
                                Marcar todos como leídos
                            </button>
                        )}
                    </div>

                    <div className="notif-dropdown-list">
                        {notifications.length === 0 ? (
                            <div className="notif-dropdown-empty">
                                <Bell size={24} aria-hidden="true" />
                                <p>No tenés avisos.</p>
                            </div>
                        ) : (
                            <ul className="notif-lista">
                                {notifications.map(n => (
                                    <li key={n.id} className={`notif-dropdown-item ${!n.isRead ? 'unread' : ''}`}>
                                        <div className="notif-dropdown-indicator" aria-hidden="true" />
                                        <div className="notif-dropdown-body">
                                            <div className="notif-dropdown-title-row">
                                                <span className="notif-dropdown-title">
                                                    {!n.isRead && <span className="sr-only">Sin leer: </span>}
                                                    {n.title}
                                                </span>
                                                <span className={`badge ${priorityColors[n.priority]}`}>
                                                    <span className="sr-only">Prioridad </span>{priorityLabels[n.priority]}
                                                </span>
                                            </div>
                                            <p className="notif-dropdown-msg">{n.message}</p>
                                            <div className="notif-dropdown-meta">
                                                <span>{n.fromName}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>{new Date(n.createdAt).toLocaleDateString('es-AR', {
                                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                })}</span>
                                            </div>
                                        </div>
                                        {!n.isRead && (
                                            <button
                                                type="button"
                                                className="notif-read-btn"
                                                onClick={() => markAsRead(n.id)}
                                                aria-label={`Marcar como leído: ${n.title}`}
                                                title="Marcar como leído"
                                            >
                                                <Check size={15} aria-hidden="true" />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
