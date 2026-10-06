import { lazy, Suspense } from 'react';
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

// Pública a propósito y fuera de `Pantalla`: la abre alguien que escaneó el QR
// de una clase en vivo, sin cuenta, y no tiene que bajarse nada de más.
const ClaseEnVivoInvitado = lazy(() => import('./pages/ClaseEnVivoInvitado'));

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

              {/* Invitados por QR — pública a propósito: el que escanea no
                  tiene cuenta y no la va a crear parado en una sala. */}
              <Route path="/vivo/:codigo" element={
                <Suspense fallback={<CargandoPantalla />}><ClaseEnVivoInvitado /></Suspense>
              } />

              <Route path="/" element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route index element={<HomeRedirect />} />

                {/* Staff */}
                {ruta('/alerts', STAFF)}
                {ruta('/familias', STAFF)}
                {/* Normativa: dirección la carga, el equipo docente la consulta. */}
                {ruta('/normativa', STAFF)}

                {/* Todos los roles. Migue: qué asistente le toca a cada uno lo
                    decide el servidor según el rol, no el cliente. */}
                {ruta('/settings')}
                {ruta('/migue')}

                {/* Docente */}
                {ruta('/hoy', ['docente'])}
                {ruta('/mis-clases', ['docente'])}
                {ruta('/libreta', ['docente'])}
                {ruta('/asistencia', ['docente'])}
                {ruta('/corregir', ['docente'])}
                {ruta('/modulo', ['docente'])}
                <Route path="crear" element={<Navigate to="/actividad-rapida" replace />} />
                {ruta('/agenda', ['docente'])}
                {ruta('/ia-lab', ['docente'])}
                {ruta('/clase-en-vivo', ['docente'])}
                {ruta('/actividad-rapida', ['docente'])}
                {ruta('/students', ['docente'])}
                {ruta('/biblioteca', ['docente'])}
                {ruta('/actividades', ['docente'])}
                {ruta('/actividades/:id', ['docente'])}

                {/* Familia */}
                {ruta('/comunicados-familia', ['padre'])}
                {ruta('/mis-hijos', ['padre'])}

                {/* Estudiante */}
                {ruta('/mis-actividades', ['estudiante'])}
                {ruta('/mis-actividades/:id', ['estudiante'])}
                {ruta('/estudiar', ['estudiante'])}
                {ruta('/mi-biblioteca', ['estudiante'])}
                {ruta('/mi-guia', ['estudiante'])}
                {ruta('/clase', ['estudiante'])}
                {ruta('/vocacional', ['estudiante'])}

                {/* Dirección. El panel de dirección es su inicio; el tablero
                    (/dashboard) es solo de dirección, el docente arranca en /hoy. */}
                {ruta('/panel', ['director'])}
                {ruta('/dashboard', ['director'])}
                {ruta('/docentes', ['director'])}
                {ruta('/horario', ['director'])}
                {ruta('/cursos/:id', ['director'])}
                {ruta('/comunicaciones', ['director'])}
                {ruta('/mi-escuela', ['director'])}

                {/* Superadmin: escuelas y cuentas. Quién puede qué lo decide
                    la base (migración de membresías); acá solo se enruta. */}
                {ruta('/admin', ['superadmin'])}
                {ruta('/admin/escuelas/:id', ['superadmin'])}
                {ruta('/admin/consumo-ia', ['superadmin'])}
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
