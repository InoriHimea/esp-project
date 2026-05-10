import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { clearToken, getToken } from '../auth/tokenStore';
import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';

/** Parse the `username` field from a JWT payload without a library. */
function parseUsername(token: string | null): string {
  if (!token) return '用户';
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json) as Record<string, unknown>;
    return typeof data.username === 'string' ? data.username : '用户';
  } catch {
    return '用户';
  }
}

export default function Shell() {
  const navigate = useNavigate();
  const username = parseUsername(getToken());

  function handleLogout() {
    clearToken();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Right column: topbar + content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <span className="text-sm text-gray-400">
            欢迎，<span className="text-white font-medium">{username}</span>
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            aria-label="登出"
          >
            <LogOut size={16} />
            登出
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />
    </div>
  );
}
