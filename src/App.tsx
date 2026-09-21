import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import Libreta from './pages/Libreta';
import CourseDetail from './pages/CourseDetail';
import Comunicaciones from './pages/Comunicaciones';
import Actividades from './pages/Actividades';
import ActividadDetalle from './pages/ActividadDetalle';
import MisActividades from './pages/MisActividades';
import RealizarActividad from './pages/RealizarActividad';
import MiBiblioteca from './pages/MiBiblioteca';
import Familias from './pages/Familias';
import ActividadRapida from './pages/ActividadRapida';
import ComunicadosFamilia from './pages/ComunicadosFamilia';
import MisHijos from './pages/MisHijos';
import Estudiar from './pages/Estudiar';
import Normativa from './pages/Normativa';
import Migue from './pages/Migue';
import Vocacional from './pages/Vocacional';

/** Redirige al home según el rol. */
function HomeRedirect() {
  const { user } = useAuth();
  const home = user?.role === 'estudiante' ? '/mis-actividades'
    : user?.role === 'padre' ? '/comunicados-familia'
    : '/dashboard';
  return <Navigate to={home} replace />;
}

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
            <Route index element={<HomeRedirect />} />

            {/* Shared routes (staff) */}
            <Route path="dashboard" element={
              <ProtectedRoute allowedRoles={['docente', 'director']}><Dashboard /></ProtectedRoute>
            } />
            <Route path="alerts" element={
              <ProtectedRoute allowedRoles={['docente', 'director']}><Alerts /></ProtectedRoute>
            } />
            <Route path="settings" element={<Settings />} />
            {/* Migue: los cuatro roles entran por la misma ruta. Qué asistente
                les toca lo decide el servidor según su rol, no el cliente. */}
            <Route path="migue" element={<Migue />} />

            {/* Teacher-only */}
            <Route path="agenda" element={
              <ProtectedRoute allowedRoles={['docente']}><Agenda /></ProtectedRoute>
            } />
            <Route path="ia-lab" element={
              <ProtectedRoute allowedRoles={['docente']}><IALab /></ProtectedRoute>
            } />
            <Route path="actividad-rapida" element={
              <ProtectedRoute allowedRoles={['docente']}><ActividadRapida /></ProtectedRoute>
            } />
            <Route path="students" element={
              <ProtectedRoute allowedRoles={['docente']}><Students /></ProtectedRoute>
            } />
            <Route path="biblioteca" element={
              <ProtectedRoute allowedRoles={['docente']}><Biblioteca /></ProtectedRoute>
            } />
            <Route path="actividades" element={
              <ProtectedRoute allowedRoles={['docente']}><Actividades /></ProtectedRoute>
            } />
            <Route path="actividades/:id" element={
              <ProtectedRoute allowedRoles={['docente']}><ActividadDetalle /></ProtectedRoute>
            } />
            <Route path="libreta" element={
              <ProtectedRoute allowedRoles={['docente']}><Libreta /></ProtectedRoute>
            } />

            {/* Staff: comunicación con familias */}
            <Route path="familias" element={
              <ProtectedRoute allowedRoles={['docente', 'director']}><Familias /></ProtectedRoute>
            } />

            {/* Familia-only */}
            <Route path="comunicados-familia" element={
              <ProtectedRoute allowedRoles={['padre']}><ComunicadosFamilia /></ProtectedRoute>
            } />
            <Route path="mis-hijos" element={
              <ProtectedRoute allowedRoles={['padre']}><MisHijos /></ProtectedRoute>
            } />

            {/* Student-only */}
            <Route path="mis-actividades" element={
              <ProtectedRoute allowedRoles={['estudiante']}><MisActividades /></ProtectedRoute>
            } />
            <Route path="mis-actividades/:id" element={
              <ProtectedRoute allowedRoles={['estudiante']}><RealizarActividad /></ProtectedRoute>
            } />
            <Route path="estudiar" element={
              <ProtectedRoute allowedRoles={['estudiante']}><Estudiar /></ProtectedRoute>
            } />
            <Route path="mi-biblioteca" element={
              <ProtectedRoute allowedRoles={['estudiante']}><MiBiblioteca /></ProtectedRoute>
            } />
            <Route path="vocacional" element={
              <ProtectedRoute allowedRoles={['estudiante']}><Vocacional /></ProtectedRoute>
            } />

            {/* Director-only */}
            <Route path="docentes" element={
              <ProtectedRoute allowedRoles={['director']}><Docentes /></ProtectedRoute>
            } />
            <Route path="cursos/:id" element={
              <ProtectedRoute allowedRoles={['director']}><CourseDetail /></ProtectedRoute>
            } />
            <Route path="comunicaciones" element={
              <ProtectedRoute allowedRoles={['director']}><Comunicaciones /></ProtectedRoute>
            } />
            {/* Normativa: dirección la carga, el equipo docente la consulta. */}
            <Route path="normativa" element={
              <ProtectedRoute allowedRoles={['director', 'docente']}><Normativa /></ProtectedRoute>
            } />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
