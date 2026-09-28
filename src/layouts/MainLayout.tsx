import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import OfflineBanner from '../components/OfflineBanner';
import GuiaRapida, { shouldAutoOpenGuide } from '../components/GuiaRapida';
import CambiarClave from '../components/CambiarClave';
import { useAuth } from '../contexts/AuthContext';
import { startOfflineSync } from '../services/offline-queue.service';
import './MainLayout.css';

export default function MainLayout() {
    const { user } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const location = useLocation();

    // La cola offline arranca una sola vez con la app
    useEffect(() => { startOfflineSync(); }, []);

    // La guía se abre sola la primera vez (salvo que pidan que no)
    useEffect(() => {
        // La guía es de uso en el aula: el superadmin no tiene destinos ahí
        if (user && user.role !== 'superadmin' && shouldAutoOpenGuide(user.role)) setShowGuide(true);
    }, [user?.id]);

    // Al navegar en móvil, cerramos el drawer
    useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

    // Con la clave inicial que dio la escuela no se entra: primero una propia
    if (user?.mustChangePassword) return <CambiarClave />;

    return (
        <div className={`layout-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(c => !c)}
            />
            {mobileNavOpen && (
                <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />
            )}
            <div className="main-wrapper">
                <Topbar onMenuClick={() => setMobileNavOpen(o => !o)} onHelpClick={() => setShowGuide(true)} />
                <OfflineBanner />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
            {showGuide && <GuiaRapida onClose={() => setShowGuide(false)} />}
        </div>
    );
}
