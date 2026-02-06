import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

export function Webhooks() {
  const { data, refresh } = useApi(() => api.getWebhooks(), []);
  usePolling(refresh);

  const webhooks = data?.data ?? [];

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'enabled', label: 'Status', render: (w: any) => <StatusBadge status={w.enabled ? 'enabled' : 'disabled'} /> },
    { key: 'behaviorId', label: 'Behavior', render: (w: any) => w.behaviorId || '-' },
    { key: 'createdAt', label: 'Created', render: (w: any) => new Date(w.createdAt).toLocaleDateString() },
  ];

  const handleDelete = async (w: any) => {
    await api.deleteWebhook(w.id);
    refresh();
  };

  return (
    <div className="page">
      <h2>Webhooks</h2>
      <DataTable
        columns={columns}
        rows={webhooks}
        keyField="id"
        actions={(w: any) => (
          <button className="btn-sm btn-danger" onClick={() => handleDelete(w)}>Delete</button>
        )}
      />
    </div>
  );
}
