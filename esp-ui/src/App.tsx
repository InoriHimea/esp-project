import { Routes, Route } from 'react-router-dom';
import LoginPage from './auth/LoginPage';
import AuthGuard from './auth/AuthGuard';
import Shell from './layout/Shell';
import DashboardPage from './modules/dashboard/DashboardPage';
import MotorPage from './modules/motor/MotorPage';
import DebugPage from './modules/debug/DebugPage';
import SettingsPage from './modules/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard><Shell /></AuthGuard>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/motor/:deviceId" element={<MotorPage />} />
        <Route path="/debug/:deviceId" element={<DebugPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
