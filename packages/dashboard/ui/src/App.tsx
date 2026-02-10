import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { UnlockVault } from './pages/UnlockVault';
import { Overview } from './pages/Overview';
import { Chat } from './pages/Chat';
import { Behaviors } from './pages/Behaviors';
import { Webhooks } from './pages/Webhooks';
import { AuditLog } from './pages/AuditLog';
import { SettingsIdentity } from './pages/settings/Identity';
import { SettingsPersonality } from './pages/settings/Personality';
import { SettingsProvider } from './pages/settings/Provider';
import { SettingsChannels } from './pages/settings/Channels';
import { SettingsSecurity } from './pages/settings/Security';
import { SetupWelcome } from './pages/SetupWelcome';
import { SetupVault } from './pages/SetupVault';
import { SetupDashboardPassword } from './pages/SetupDashboardPassword';
import { SetupIdentity } from './pages/SetupIdentity';
import { SetupPersonality } from './pages/SetupPersonality';
import { SetupProvider } from './pages/SetupProvider';
import { SetupChannels } from './pages/SetupChannels';
import { SetupConnections } from './pages/SetupConnections';
import { SetupComplete } from './pages/SetupComplete';
import { SettingsAmbient } from './pages/SettingsAmbient';
import { SettingsNotifications } from './pages/SettingsNotifications';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unlock" element={<UnlockVault />} />
      <Route path="/setup" element={<SetupWelcome />} />
      <Route path="/setup/vault" element={<SetupVault />} />
      <Route path="/setup/dashboard-password" element={<SetupDashboardPassword />} />
      <Route path="/setup/identity" element={<SetupIdentity />} />
      <Route path="/setup/personality" element={<SetupPersonality />} />
      <Route path="/setup/provider" element={<SetupProvider />} />
      <Route path="/setup/channels" element={<SetupChannels />} />
      <Route path="/setup/connections" element={<SetupConnections />} />
      <Route path="/setup/complete" element={<SetupComplete />} />
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="chat" element={<Chat />} />
        <Route path="behaviors" element={<Behaviors />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="settings/identity" element={<SettingsIdentity />} />
        <Route path="settings/personality" element={<SettingsPersonality />} />
        <Route path="settings/provider" element={<SettingsProvider />} />
        <Route path="settings/channels" element={<SettingsChannels />} />
        <Route path="settings/ambient" element={<SettingsAmbient />} />
        <Route path="settings/notifications" element={<SettingsNotifications />} />
        <Route path="settings/security" element={<SettingsSecurity />} />
        <Route path="settings/audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
