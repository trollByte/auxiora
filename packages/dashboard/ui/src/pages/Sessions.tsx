import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';

export function Sessions() {
  const { data, refresh } = useApi(() => api.getSessions(), []);
  usePolling(refresh);

  const sessions = data?.data ?? [];

  const columns = [
    { key: 'id', label: 'Session ID', render: (s: any) => s.id.slice(0, 8) + '...' },
    { key: 'channelType', label: 'Channel' },
    { key: 'authenticated', label: 'Auth', render: (s: any) => s.authenticated ? 'Yes' : 'No' },
    { key: 'voiceActive', label: 'Voice', render: (s: any) => s.voiceActive ? 'Active' : '-' },
    { key: 'lastActive', label: 'Last Active', render: (s: any) => new Date(s.lastActive).toLocaleString() },
  ];

  return (
    <div className="page">
      <h2>Active Sessions</h2>
      <DataTable columns={columns} rows={sessions} keyField="id" />
    </div>
  );
}
