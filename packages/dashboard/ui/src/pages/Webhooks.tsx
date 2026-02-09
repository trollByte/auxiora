import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

export function Webhooks() {
  const { data, refresh } = useApi(() => api.getWebhooks(), []);
  const { data: behaviorsData } = useApi(() => api.getBehaviors(), []);
  usePolling(refresh);

  const webhooks = data?.data ?? [];
  const behaviors = behaviorsData?.data ?? [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [behaviorId, setBehaviorId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'enabled', label: 'Status', render: (w: any) => <StatusBadge status={w.enabled ? 'enabled' : 'disabled'} /> },
    { key: 'behaviorId', label: 'Behavior', render: (w: any) => w.behaviorId || '-' },
    { key: 'createdAt', label: 'Created', render: (w: any) => new Date(w.createdAt).toLocaleDateString() },
  ];

  const handleToggle = async (w: any) => {
    try {
      await api.patchWebhook(w.id, { enabled: !w.enabled });
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update webhook');
    }
  };

  const handleDelete = async (w: any) => {
    if (!confirm(`Delete webhook "${w.name}"?`)) return;
    try {
      await api.deleteWebhook(w.id);
      refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete webhook');
    }
  };

  const resetForm = () => {
    setName('');
    setSecret('');
    setBehaviorId('');
    setError('');
    setCreatedUrl('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreatedUrl('');
    setCreating(true);

    try {
      const input: Record<string, unknown> = { name, secret };
      if (behaviorId) input.behaviorId = behaviorId;

      await api.createWebhook(input);
      const webhookUrl = `${window.location.origin}/api/v1/webhooks/custom/${name}`;
      setCreatedUrl(webhookUrl);
      resetForm();
      setShowForm(false);
      refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create webhook');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <h2>Webhooks</h2>

      <div className="create-form-toggle">
        <button
          className="btn-sm"
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
        >
          {showForm ? 'Cancel' : 'New Webhook'}
        </button>
      </div>

      {createdUrl && (
        <div className="create-form-success">
          Webhook created. URL: <code>{createdUrl}</code>
        </div>
      )}

      {showForm && (
        <div className="create-form">
          <form onSubmit={handleCreate}>
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-webhook"
              pattern="[a-zA-Z0-9_-]+"
              title="URL-safe: letters, numbers, hyphens, underscores"
              required
            />

            <label>Secret</label>
            <input
              type="password"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="HMAC signing key"
              required
            />

            <label>Behavior (optional)</label>
            <select value={behaviorId} onChange={e => setBehaviorId(e.target.value)}>
              <option value="">None</option>
              {behaviors.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.action?.slice(0, 50) || b.id}
                </option>
              ))}
            </select>

            {error && <div className="error">{error}</div>}

            <button type="submit" className="settings-btn" disabled={creating || !name || !secret}>
              {creating ? 'Creating...' : 'Create Webhook'}
            </button>
          </form>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={webhooks}
        keyField="id"
        actions={(w: any) => (
          <>
            <button className="btn-sm" onClick={() => handleToggle(w)}>
              {w.enabled ? 'Disable' : 'Enable'}
            </button>
            <button className="btn-sm btn-danger" onClick={() => handleDelete(w)}>Delete</button>
          </>
        )}
      />
    </div>
  );
}
