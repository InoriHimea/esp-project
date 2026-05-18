import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-gray-900 border-t border-gray-800 flex">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              isActive ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300',
            ].join(' ')
          }
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
