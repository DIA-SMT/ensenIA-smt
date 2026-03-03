import { useState, useRef, useEffect } from 'react';
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
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    return (
        <div className="notif-dropdown-container" ref={dropdownRef}>
            <button
                className="btn-icon notif-btn"
                title="Notificaciones"
                onClick={() => setIsOpen(prev => !prev)}
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span className="notif-dot">
                        <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notif-dropdown card">
                    <div className="notif-dropdown-header">
                        <h4>Notificaciones</h4>
                        {unreadCount > 0 && (
                            <button className="btn btn-ghost text-sm" onClick={markAllAsRead}>
                                <CheckCheck size={14} />
                                Marcar todo leído
                            </button>
                        )}
                    </div>

                    <div className="notif-dropdown-list">
                        {notifications.length === 0 ? (
                            <div className="notif-dropdown-empty">
                                <Bell size={24} />
                                <p>Sin notificaciones</p>
                            </div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.id}
                                    className={`notif-dropdown-item ${!n.isRead ? 'unread' : ''}`}
                                    onClick={() => markAsRead(n.id)}
                                >
                                    <div className="notif-dropdown-indicator" />
                                    <div className="notif-dropdown-body">
                                        <div className="notif-dropdown-title-row">
                                            <span className="notif-dropdown-title">{n.title}</span>
                                            <span className={`badge ${priorityColors[n.priority]}`}>
                                                {priorityLabels[n.priority]}
                                            </span>
                                        </div>
                                        <p className="notif-dropdown-msg">{n.message}</p>
                                        <div className="notif-dropdown-meta">
                                            <span>{n.fromName}</span>
                                            <span>·</span>
                                            <span>{new Date(n.createdAt).toLocaleDateString('es-AR', {
                                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                            })}</span>
                                        </div>
                                    </div>
                                    {!n.isRead && (
                                        <button className="notif-read-btn" title="Marcar como leído">
                                            <Check size={14} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
