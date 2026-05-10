import { Navigate, Outlet } from 'react-router-dom';
import { getToken } from './tokenStore';

interface AuthGuardProps {
  children?: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
