/**
 * Avisos de la barra superior.
 *
 * El botón dice cuántos hay sin leer también para el lector de pantalla
 * ("Avisos, 3 sin leer"), el panel se abre y se cierra con teclado
 * (Escape devuelve el foco al botón) y cada aviso es un botón de verdad:
 * antes eran recuadros que solo respondían al mouse.
 *
 * Para el docente, arriba de todo: las entregas que esperan su nota (y un
 * aviso cuando llegan nuevas con la app abierta). Antes nada le avisaba.
 */

import { useState, useRef, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, ClipboardCheck, ChevronRight } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { getPendingGradingCount } from '../services/activities.service';
import { avisar } from './ui/avisar';
import EstadoVacio from './ui/EstadoVacio';
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
    const { user, isDocente } = useAuth();
    const [porCorregir, setPorCorregir] = useState(0);

    // Entregas esperando nota: al entrar, al volver a la pestaña y cada 2 minutos
    // mientras se ve. Si sube con la app abierta, se avisa.
    useEffect(() => {
        if (!isDocente || !user) return;
        let vivo = true;
        let anterior: number | null = null;
        const contar = () => {
            if (document.visibilityState !== 'visible') return;
            getPendingGradingCount(user.id).then(n => {
                if (!vivo) return;
                if (anterior !== null && n > anterior) {
                    const nuevas = n - anterior;
                    avisar.info(nuevas === 1 ? 'Llegó una entrega nueva' : `Llegaron ${nuevas} entregas nuevas`, 'Están en Corregir, esperando tu nota.');
                }
                anterior = n;
                setPorCorregir(n);
            }).catch(() => { /* sin conexión: se reintenta en la próxima vuelta */ });
        };
        contar();
        const intervalo = window.setInterval(contar, 120_000);
        document.addEventListener('visibilitychange', contar);
        return () => {
            vivo = false;
            window.clearInterval(intervalo);
            document.removeEventListener('visibilitychange', contar);
        };
    }, [isDocente, user]);
    const total = unreadCount + porCorregir;

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

    const partes = [
        unreadCount > 0 ? `${unreadCount} sin leer` : '',
        porCorregir > 0 ? `${porCorregir} ${porCorregir === 1 ? 'entrega' : 'entregas'} para corregir` : '',
    ].filter(Boolean);
    const nombreBoton = partes.length ? `Avisos, ${partes.join(', ')}` : 'Avisos, ninguno sin leer';

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
                {total > 0 && (
                    <span className="notif-dot" aria-hidden="true">
                        <span className="notif-count">{total > 9 ? '9+' : total}</span>
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
                        {porCorregir > 0 && (
                            <Link to="/corregir" className="notif-corregir" onClick={() => setIsOpen(false)}>
                                <span className="notif-corregir-icono" aria-hidden="true"><ClipboardCheck size={18} /></span>
                                <span className="notif-corregir-textos">
                                    <strong>{porCorregir === 1 ? '1 entrega esperando tu nota' : `${porCorregir} entregas esperando tu nota`}</strong>
                                    <span>Corregilas todas de una, con las respuestas a la vista.</span>
                                </span>
                                <ChevronRight size={16} aria-hidden="true" />
                            </Link>
                        )}
                        {notifications.length === 0 && porCorregir > 0 ? null : notifications.length === 0 ? (
                            <EstadoVacio
                                compacto
                                className="notif-vacio"
                                icono={Bell}
                                titulo="No tenés avisos"
                                texto={user?.role === 'director'
                                    ? 'Cuando un docente te avise algo o una alerta se escale, aparece acá.'
                                    : isDocente
                                        ? 'Acá aparecen las entregas por corregir. Lo que manda dirección está en Comunicados.'
                                        : 'Cuando la escuela te avise algo, aparece acá.'}
                            />
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
