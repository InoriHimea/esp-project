import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Cpu, Bug, Settings } from 'lucide-react';

const navItems = [
  { to: '/',                  label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/motor/motor-01',    label: 'Motor',     icon: Cpu },
  { to: '/debug/motor-01',    label: 'Debug',     icon: Bug },
  { to: '/settings',          label: 'Settings',  icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-gray-900 border-r border-gray-800 h-screen">
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-800">
        <Cpu className="text-indigo-400" size={22} />
        <span className="text-white font-semibold tracking-wide text-sm">ESP Control</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
