import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';

const CHANNEL_TYPES = ['webchat', 'discord', 'telegram', 'slack', 'twilio', 'matrix', 'signal', 'teams', 'whatsapp', 'email'] as const;

export function Layout() {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [agentName, setAgentName] = useState('Auxiora');
  const navigate = useNavigate();

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

  // Only make authenticated calls once vault/setup check passes
  const { data: status, refresh } = useApi(() => ready ? api.getStatus() : Promise.resolve(null), [ready]);
  const { data: sessions, refresh: refreshSessions } = useApi(() => ready ? api.getSessions() : Promise.resolve(null), [ready]);
  usePolling(() => { if (ready) { refresh(); refreshSessions(); } });

  if (checking) return null;

  // Derive connected channel types from active sessions
  const connectedChannels = new Set<string>();
  if (sessions?.data) {
    for (const s of sessions.data) {
      if (s.channelType) connectedChannels.add(s.channelType);
    }
  }

  // Only show channels that have connections or are commonly configured
  const visibleChannels = CHANNEL_TYPES.filter(ch =>
    connectedChannels.has(ch) || ch === 'webchat'
  );

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>{agentName}</h1>
        </div>
        <ul className="nav-list">
          {/* MAIN */}
          <div className="nav-group">
            <div className="nav-group-label">Main</div>
            <li>
              <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Chat
              </NavLink>
            </li>
            <li>
              <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                Dashboard
              </NavLink>
            </li>
          </div>

          {/* CHANNELS */}
          <div className="nav-group">
            <div className="nav-group-label">Channels</div>
            {visibleChannels.map(ch => (
              <li key={ch}>
                <NavLink to="/settings/channels" className="nav-link">
                  {ch.charAt(0).toUpperCase() + ch.slice(1)}
                  <span className={`channel-dot ${connectedChannels.has(ch) ? 'connected' : 'disconnected'}`} />
                </NavLink>
              </li>
            ))}
          </div>

          {/* MANAGEMENT */}
          <div className="nav-group">
            <div className="nav-group-label">Management</div>
            <li>
              <NavLink to="/behaviors" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Behaviors
              </NavLink>
            </li>
            <li>
              <NavLink to="/webhooks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Webhooks
              </NavLink>
            </li>
          </div>

          {/* SETTINGS */}
          <div className="nav-group">
            <div className="nav-group-label">Settings</div>
            <li>
              <NavLink to="/settings/identity" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Identity
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/personality" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Personality
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/provider" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Provider
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/channels" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Channels
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/ambient" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Ambient
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/notifications" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Notifications
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/security" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Security
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/audit" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Audit Log
              </NavLink>
            </li>
          </div>
        </ul>
        <button className="logout-btn" onClick={() => api.logout().then(() => { window.location.href = '/dashboard/login'; })}>
          Logout
        </button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
