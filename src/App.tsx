import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import ProtectedRoute from './components/ProtectedRoute';
import CargandoPantalla from './components/CargandoPantalla';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import { Pantalla } from './lib/pantallas';
import { inicioDe } from './lib/navegacion';
import type { UserRole } from './types';

/** Redirige al inicio de cada rol. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={inicioDe(user?.role)} replace />;
}

/** Ruta protegida cuyo componente se baja recién cuando se abre. */
function ruta(path: keyof typeof Pantalla, roles?: UserRole[]) {
  const Componente = Pantalla[path];
  const pantalla = (
    <Suspense fallback={<CargandoPantalla />}>
      <Componente />
    </Suspense>
  );
  return (
    <Route
      key={path}
      path={path.slice(1)}
      element={roles ? <ProtectedRoute allowedRoles={roles}>{pantalla}</ProtectedRoute> : pantalla}
    />
  );
}

const STAFF: UserRole[] = ['docente', 'director'];

function App() {
  return (
    <BrowserRouter>
      <PreferencesProvider>
        <AuthProvider>
          <NotificationProvider>
            <Routes>
              {/* Login — afuera del armazón, y en el archivo principal:
                  es lo primero que ve cualquiera. */}
              <Route path="/login" element={<Login />} />

              <Route path="/" element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route index element={<HomeRedirect />} />

                {/* Staff */}
                {ruta('/dashboard', STAFF)}
                {ruta('/alerts', STAFF)}
                {ruta('/familias', STAFF)}
                {/* Normativa: dirección la carga, el equipo docente la consulta. */}
                {ruta('/normativa', STAFF)}

                {/* Todos los roles. Migue: qué asistente le toca a cada uno lo
                    decide el servidor según el rol, no el cliente. */}
                {ruta('/settings')}
                {ruta('/migue')}

                {/* Docente */}
                {ruta('/agenda', ['docente'])}
                {ruta('/ia-lab', ['docente'])}
                {ruta('/actividad-rapida', ['docente'])}
                {ruta('/students', ['docente'])}
                {ruta('/biblioteca', ['docente'])}
                {ruta('/actividades', ['docente'])}
                {ruta('/actividades/:id', ['docente'])}
                {ruta('/libreta', ['docente'])}

                {/* Familia */}
                {ruta('/comunicados-familia', ['padre'])}
                {ruta('/mis-hijos', ['padre'])}

                {/* Estudiante */}
                {ruta('/mis-actividades', ['estudiante'])}
                {ruta('/mis-actividades/:id', ['estudiante'])}
                {ruta('/estudiar', ['estudiante'])}
                {ruta('/mi-biblioteca', ['estudiante'])}
                {ruta('/vocacional', ['estudiante'])}

                {/* Dirección */}
                {ruta('/docentes', ['director'])}
                {ruta('/cursos/:id', ['director'])}
                {ruta('/comunicaciones', ['director'])}
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </PreferencesProvider>
    </BrowserRouter>
  );
}

export default App;
