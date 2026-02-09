import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

type BehaviorType = 'scheduled' | 'monitor' | 'one-shot';

export function Behaviors() {
  const { data, refresh } = useApi(() => api.getBehaviors(), []);
  usePolling(refresh);

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<BehaviorType>('scheduled');
  const [action, setAction] = useState('');
  const [cron, setCron] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [condition, setCondition] = useState('');
  const [runAt, setRunAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    try {
      const newStatus = b.status === 'active' ? 'paused' : 'active';
      await api.patchBehavior(b.id, { status: newStatus });
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update behavior');
    }
  };

  const handleDelete = async (b: any) => {
    if (!confirm(`Delete behavior "${b.action?.slice(0, 40)}"?`)) return;
    try {
      await api.deleteBehavior(b.id);
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete behavior');
    }
  };

  const resetForm = () => {
    setType('scheduled');
    setAction('');
    setCron('');
    setTimezone('UTC');
    setIntervalMinutes(5);
    setCondition('');
    setRunAt('');
    setError('');
    setSuccess('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      const input: Record<string, unknown> = { type, action };
      if (type === 'scheduled') {
        input.cron = cron;
        input.timezone = timezone;
      } else if (type === 'monitor') {
        input.intervalMinutes = intervalMinutes;
        input.condition = condition;
      } else if (type === 'one-shot') {
        input.runAt = runAt;
      }

      await api.createBehavior(input);
      setSuccess('Behavior created');
      resetForm();
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create behavior');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <h2>Behaviors</h2>

      <div className="create-form-toggle">
        <button
          className="btn-sm"
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
        >
          {showForm ? 'Cancel' : 'New Behavior'}
        </button>
      </div>

      {showForm && (
        <div className="create-form">
          <form onSubmit={handleCreate}>
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value as BehaviorType)}>
              <option value="scheduled">Scheduled (cron)</option>
              <option value="monitor">Monitor (polling)</option>
              <option value="one-shot">One-shot (run once)</option>
            </select>

            <label>Action</label>
            <textarea
              value={action}
              onChange={e => setAction(e.target.value)}
              placeholder="What should the agent do?"
              required
              rows={3}
            />

            {type === 'scheduled' && (
              <div className="create-form-group">
                <label>Cron Expression</label>
                <input
                  type="text"
                  value={cron}
                  onChange={e => setCron(e.target.value)}
                  placeholder="0 8 * * *"
                  required
                />
                <label>Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  placeholder="UTC"
                />
              </div>
            )}

            {type === 'monitor' && (
              <div className="create-form-group">
                <label>Interval (minutes)</label>
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={e => setIntervalMinutes(Number(e.target.value))}
                  min={1}
                  required
                />
                <label>Condition</label>
                <textarea
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                  placeholder="When should this trigger?"
                  required
                  rows={2}
                />
              </div>
            )}

            {type === 'one-shot' && (
              <div className="create-form-group">
                <label>Run at</label>
                <input
                  type="datetime-local"
                  value={runAt}
                  onChange={e => setRunAt(e.target.value)}
                  required
                />
              </div>
            )}

            {error && <div className="error">{error}</div>}
            {success && <div className="settings-success">{success}</div>}

            <button type="submit" className="settings-btn" disabled={creating || !action}>
              {creating ? 'Creating...' : 'Create Behavior'}
            </button>
          </form>
        </div>
      )}

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
