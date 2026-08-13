import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show nothing while checking auth status
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-main)',
        color: 'var(--text-secondary)',
      }}>
        Cargando...
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preservamos el destino (clave para los QR de actividades):
    // el estudiante escanea, loguea una vez y cae donde apuntaba el QR.
    const intended = location.pathname + location.search;
    const next = intended && intended !== '/' ? `?next=${encodeURIComponent(intended)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Cada rol tiene su "home"
    const home = user.role === 'estudiante' ? '/mis-actividades'
      : user.role === 'padre' ? '/comunicados-familia'
      : '/dashboard';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
