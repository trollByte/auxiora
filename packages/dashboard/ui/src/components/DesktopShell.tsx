import { useState, useEffect, useMemo, useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { usePolling } from '../hooks/usePolling.js';
import { useWindowState } from '../hooks/useWindowState.js';
import { Window } from './Window.js';
import { Dock, type DockItem } from './Dock.js';

import { Overview } from '../pages/Overview.js';
import { Chat } from '../pages/Chat.js';
import { Behaviors } from '../pages/Behaviors.js';
import { Webhooks } from '../pages/Webhooks.js';
import { PersonalityEditor } from '../pages/settings/PersonalityEditor.js';
import { SettingsProvider } from '../pages/settings/Provider.js';
import { SettingsChannels } from '../pages/settings/Channels.js';
import { SettingsSecurity } from '../pages/settings/Security.js';
import { SettingsAppearance } from '../pages/settings/Appearance.js';
import { SettingsConnections } from '../pages/SettingsConnections.js';
import { SettingsAmbient } from '../pages/SettingsAmbient.js';
import { SettingsArchitect } from '../pages/settings/Architect.js';
import { UserProfile } from '../pages/UserProfile.js';
import { SettingsNotifications } from '../pages/SettingsNotifications.js';
import { AuditLog } from '../pages/AuditLog.js';
import { Marketplace } from '../pages/Marketplace.js';
import { SystemStatus } from '../pages/SystemStatus.js';
import { MemoryManager } from '../pages/MemoryManager.js';

interface AppEntry {
  id: string;
  label: string;
  icon: string;
  component: () => ReactElement;
  defaultWidth?: number;
  defaultHeight?: number;
}

const APPS: AppEntry[] = [
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}', component: () => <Chat />, defaultWidth: 860, defaultHeight: 600 },
  { id: 'status', label: 'System Status', icon: '\u{1F4CA}', component: () => <SystemStatus />, defaultWidth: 860, defaultHeight: 640 },
  { id: 'overview', label: 'Mission Control', icon: '\u{1F3AF}', component: () => <Overview />, defaultWidth: 820, defaultHeight: 600 },
  { id: 'architect', label: 'The Architect', icon: '\u{1F3D7}\uFE0F', component: () => <SettingsArchitect />, defaultWidth: 780, defaultHeight: 600 },
  { id: 'profile', label: 'About Me', icon: '\u{1F464}', component: () => <UserProfile />, defaultWidth: 780, defaultHeight: 600 },
  { id: 'memories', label: 'Memories', icon: '\u{1F9E0}', component: () => <MemoryManager />, defaultWidth: 860, defaultHeight: 640 },
  { id: 'behaviors', label: 'Behaviors', icon: '\u{1F9E9}', component: () => <Behaviors />, defaultWidth: 780, defaultHeight: 560 },
  { id: 'webhooks', label: 'Webhooks', icon: '\u{1F517}', component: () => <Webhooks />, defaultWidth: 780, defaultHeight: 560 },
  { id: 'personality', label: 'Personality', icon: '\u{1F3AD}', component: () => <PersonalityEditor />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'provider', label: 'Provider', icon: '\u{1F50C}', component: () => <SettingsProvider />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'channels', label: 'Channels', icon: '\u{1F4E1}', component: () => <SettingsChannels />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'connections', label: 'Connections', icon: '\u{1F310}', component: () => <SettingsConnections />, defaultWidth: 780, defaultHeight: 560 },
  { id: 'ambient', label: 'Ambient', icon: '\u{1F30A}', component: () => <SettingsAmbient />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'appearance', label: 'Appearance', icon: '\u{1F3A8}', component: () => <SettingsAppearance />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'notifications', label: 'Notifications', icon: '\u{1F514}', component: () => <SettingsNotifications />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'security', label: 'Security', icon: '\u{1F6E1}\uFE0F', component: () => <SettingsSecurity />, defaultWidth: 680, defaultHeight: 520 },
  { id: 'marketplace', label: 'Marketplace', icon: '\u{1F3EA}', component: () => <Marketplace />, defaultWidth: 900, defaultHeight: 640 },
  { id: 'audit', label: 'Audit Log', icon: '\u{1F4CB}', component: () => <AuditLog />, defaultWidth: 820, defaultHeight: 600 },
];

const APP_MAP = new Map(APPS.map(a => [a.id, a]));

const DOCK_ITEMS: DockItem[] = APPS.map(a => ({ id: a.id, label: a.label, icon: a.icon }));

function useClockTime(): string {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  return time;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DesktopShell() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [agentName, setAgentName] = useState('Auxiora');
  const navigate = useNavigate();
  const time = useClockTime();

  useEffect(() => {
    api.getSetupStatus()
      .then(status => {
        if (status.agentName) setAgentName(status.agentName);
        if (status.needsSetup) {
          navigate('/setup', { replace: true });
        } else if (!status.vaultUnlocked) {
          navigate('/unlock', { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const { data: _status, refresh } = useApi(() => ready ? api.getStatus() : Promise.resolve(null), [ready]);
  const { data: _sessions, refresh: refreshSessions } = useApi(() => ready ? api.getSessions() : Promise.resolve(null), [ready]);
  usePolling(() => { if (ready) { refresh(); refreshSessions(); } });

  const {
    windows,
    activeWindowId,
    openWindow,
    closeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    toggleMinimize,
    toggleMaximize,
  } = useWindowState();

  const openWindowIds = useMemo(() => new Set(windows.keys()), [windows]);

  const handleDockOpen = useCallback((id: string) => {
    const app = APP_MAP.get(id);
    if (app) openWindow(id, app.label, app.defaultWidth, app.defaultHeight);
  }, [openWindow]);

  if (checking) return null;

  return (
    <div className="desktop-shell">
      <div className="desktop-bg" />
      <div className="topbar">
        <div className="topbar-left"><span>{agentName}</span></div>
        <div className="topbar-center">{activeWindowId && APP_MAP.get(activeWindowId)?.label}</div>
        <div className="topbar-right"><span>{time}</span></div>
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        {Array.from(windows.values()).map(w => {
          const app = APP_MAP.get(w.id);
          if (!app) return null;
          return (
            <Window
              key={w.id}
              id={w.id}
              title={app.label}
              x={w.x}
              y={w.y}
              width={w.width}
              height={w.height}
              zIndex={w.zIndex}
              minimized={w.minimized}
              maximized={w.maximized}
              focused={w.id === activeWindowId}
              onClose={() => closeWindow(w.id)}
              onFocus={() => focusWindow(w.id)}
              onMinimize={() => toggleMinimize(w.id)}
              onMaximize={() => toggleMaximize(w.id)}
              onMove={(x, y) => moveWindow(w.id, x, y)}
              onResize={(width, height) => resizeWindow(w.id, width, height)}
            >
              {app.component()}
            </Window>
          );
        })}
      </div>
      <Dock items={DOCK_ITEMS} openWindows={openWindowIds} onOpen={handleDockOpen} />
    </div>
  );
}
