import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import Students from './pages/Students';
import IALab from './pages/IALab';
import Biblioteca from './pages/Biblioteca';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import Docentes from './pages/Docentes';
import Comunicaciones from './pages/Comunicaciones';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
        <Routes>
          {/* Login — outside layout */}
          <Route path="/login" element={<Login />} />

          {/* Protected — inside layout */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Shared routes */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="settings" element={<Settings />} />

            {/* Teacher-only */}
            <Route path="agenda" element={
              <ProtectedRoute allowedRoles={['docente']}><Agenda /></ProtectedRoute>
            } />
            <Route path="ia-lab" element={
              <ProtectedRoute allowedRoles={['docente']}><IALab /></ProtectedRoute>
            } />
            <Route path="students" element={
              <ProtectedRoute allowedRoles={['docente']}><Students /></ProtectedRoute>
            } />
            <Route path="biblioteca" element={
              <ProtectedRoute allowedRoles={['docente']}><Biblioteca /></ProtectedRoute>
            } />

            {/* Director-only */}
            <Route path="docentes" element={
              <ProtectedRoute allowedRoles={['director']}><Docentes /></ProtectedRoute>
            } />
            <Route path="comunicaciones" element={
              <ProtectedRoute allowedRoles={['director']}><Comunicaciones /></ProtectedRoute>
            } />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
