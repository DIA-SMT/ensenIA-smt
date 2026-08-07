import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import OfflineBanner from '../components/OfflineBanner';
import { startOfflineSync } from '../services/offline-queue.service';
import './MainLayout.css';

export default function MainLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const location = useLocation();

    // La cola offline arranca una sola vez con la app
    useEffect(() => { startOfflineSync(); }, []);

    // Al navegar en móvil, cerramos el drawer
    useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

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
                <Topbar onMenuClick={() => setMobileNavOpen(o => !o)} />
                <OfflineBanner />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
