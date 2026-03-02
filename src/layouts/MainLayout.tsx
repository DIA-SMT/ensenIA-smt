import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import './MainLayout.css';

export default function MainLayout() {
    return (
        <div className="layout-container">
            <Sidebar />
            <div className="main-wrapper">
                <Topbar />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
