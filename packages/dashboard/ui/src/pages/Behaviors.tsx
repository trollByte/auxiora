import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

export function Behaviors() {
  const { data, refresh } = useApi(() => api.getBehaviors(), []);
  usePolling(refresh);

  const behaviors = data?.data ?? [];

  const columns = [
    { key: 'action', label: 'Action', render: (b: any) => b.action?.slice(0, 60) },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
    { key: 'runCount', label: 'Runs' },
    { key: 'failCount', label: 'Fails' },
    { key: 'lastRun', label: 'Last Run', render: (b: any) => b.lastRun ? new Date(b.lastRun).toLocaleString() : '-' },
  ];

  const handleToggle = async (b: any) => {
    const newStatus = b.status === 'active' ? 'paused' : 'active';
    await api.patchBehavior(b.id, { status: newStatus });
    refresh();
  };

  const handleDelete = async (b: any) => {
    await api.deleteBehavior(b.id);
    refresh();
  };

  return (
    <div className="page">
      <h2>Behaviors</h2>
      <DataTable
        columns={columns}
        rows={behaviors}
        keyField="id"
        actions={(b: any) => (
          <>
            <button className="btn-sm" onClick={() => handleToggle(b)}>
              {b.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(b)}>Delete</button>
          </>
        )}
      />
    </div>
  );
}
