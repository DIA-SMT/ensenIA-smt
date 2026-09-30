import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { inicioDe } from '../lib/navegacion';
import CargandoPantalla from './CargandoPantalla';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <CargandoPantalla completa />;

  if (!isAuthenticated) {
    // Preservamos el destino (clave para los QR de actividades):
    // el estudiante escanea, loguea una vez y cae donde apuntaba el QR.
    const intended = location.pathname + location.search;
    const next = intended && intended !== '/' ? `?next=${encodeURIComponent(intended)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={inicioDe(user.role)} replace />;
  }

  return <>{children}</>;
}
