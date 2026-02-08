import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Behaviors } from './pages/Behaviors';
import { Webhooks } from './pages/Webhooks';
import { Sessions } from './pages/Sessions';
import { AuditLog } from './pages/AuditLog';
import { SetupWelcome } from './pages/SetupWelcome';
import { SetupVault } from './pages/SetupVault';
import { SetupDashboardPassword } from './pages/SetupDashboardPassword';
import { SetupIdentity } from './pages/SetupIdentity';
import { SetupPersonality } from './pages/SetupPersonality';
import { SetupProvider } from './pages/SetupProvider';
import { SetupChannels } from './pages/SetupChannels';
import { SetupComplete } from './pages/SetupComplete';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupWelcome />} />
      <Route path="/setup/vault" element={<SetupVault />} />
      <Route path="/setup/dashboard-password" element={<SetupDashboardPassword />} />
      <Route path="/setup/identity" element={<SetupIdentity />} />
      <Route path="/setup/personality" element={<SetupPersonality />} />
      <Route path="/setup/provider" element={<SetupProvider />} />
      <Route path="/setup/channels" element={<SetupChannels />} />
      <Route path="/setup/complete" element={<SetupComplete />} />
      <Route element={<Layout />}>
        <Route index element={<Behaviors />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
