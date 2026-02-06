import { NavLink, Outlet } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';

export function Layout() {
  const { data: status, refresh } = useApi(() => api.getStatus(), []);
  usePolling(refresh);

  const navItems = [
    { to: '/', label: 'Behaviors' },
    { to: '/webhooks', label: 'Webhooks' },
    { to: '/sessions', label: 'Sessions' },
    { to: '/audit', label: 'Audit Log' },
  ];

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Auxiora</h1>
        </div>
        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        {status?.data && (
          <div className="status-bar">
            <div className="status-item">Connections: {status.data.connections}</div>
            <div className="status-item">Behaviors: {status.data.activeBehaviors}/{status.data.totalBehaviors}</div>
            <div className="status-item">Webhooks: {status.data.webhooks}</div>
          </div>
        )}
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
