import { Routes, Route, Navigate } from 'react-router-dom';
import { DesktopShell } from './components/DesktopShell';
import { Login } from './pages/Login';
import { UnlockVault } from './pages/UnlockVault';
import { Overview } from './pages/Overview';
import { Chat } from './pages/Chat';
import { Behaviors } from './pages/Behaviors';
import { Webhooks } from './pages/Webhooks';
import { AuditLog } from './pages/AuditLog';
import { PersonalityEditor } from './pages/settings/PersonalityEditor';
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
import { SetupAppearance } from './pages/SetupAppearance';
import { SettingsAppearance } from './pages/settings/Appearance';
import { SettingsConnections } from './pages/SettingsConnections';
import { SettingsAmbient } from './pages/SettingsAmbient';
import { SettingsArchitect } from './pages/settings/Architect';
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
      <Route path="/setup/appearance" element={<SetupAppearance />} />
      <Route path="/setup/provider" element={<SetupProvider />} />
      <Route path="/setup/channels" element={<SetupChannels />} />
      <Route path="/setup/connections" element={<SetupConnections />} />
      <Route path="/setup/complete" element={<SetupComplete />} />
      <Route element={<DesktopShell />}>
        <Route index element={<Overview />} />
        <Route path="chat" element={<Chat />} />
        <Route path="behaviors" element={<Behaviors />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="settings/personality" element={<PersonalityEditor />} />
        <Route path="settings/identity" element={<Navigate to="/settings/personality" replace />} />
        <Route path="settings/provider" element={<SettingsProvider />} />
        <Route path="settings/channels" element={<SettingsChannels />} />
        <Route path="settings/connections" element={<SettingsConnections />} />
        <Route path="settings/architect" element={<SettingsArchitect />} />
        <Route path="settings/ambient" element={<SettingsAmbient />} />
        <Route path="settings/appearance" element={<SettingsAppearance />} />
        <Route path="settings/notifications" element={<SettingsNotifications />} />
        <Route path="settings/security" element={<SettingsSecurity />} />
        <Route path="settings/audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
