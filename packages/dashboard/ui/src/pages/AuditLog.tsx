import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';

const EVENT_FILTERS = ['', 'behavior.', 'webhook.', 'voice.', 'system.', 'auth.', 'dashboard.'];

export function AuditLog() {
  const [typeFilter, setTypeFilter] = useState('');
  const { data, refresh } = useApi(() => api.getAudit({ type: typeFilter || undefined, limit: 200 }), [typeFilter]);
  usePolling(refresh);

  const entries = data?.data ?? [];

  const columns = [
    { key: 'timestamp', label: 'Time', render: (e: any) => new Date(e.timestamp).toLocaleString() },
    { key: 'event', label: 'Event' },
    { key: 'details', label: 'Details', render: (e: any) => JSON.stringify(e.details).slice(0, 80) },
  ];

  return (
    <div className="page">
      <h2>Audit Log</h2>
      <div className="filters">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All events</option>
          {EVENT_FILTERS.filter(Boolean).map((f) => (
            <option key={f} value={f}>{f}*</option>
          ))}
        </select>
      </div>
      <DataTable columns={columns} rows={entries} keyField="sequence" />
    </div>
  );
}
