import { useState, useEffect, useCallback } from 'react';
import { ModelCard, type DiscoveredModel } from '../components/ModelCard.js';

type Tab = 'all' | 'openrouter' | 'huggingface' | 'trending';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Models' },
  { key: 'openrouter', label: 'OpenRouter' },
  { key: 'huggingface', label: 'HuggingFace' },
  { key: 'trending', label: 'Trending' },
];

export function ModelExplorer() {
  const [tab, setTab] = useState<Tab>('all');
  const [models, setModels] = useState<DiscoveredModel[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterVision, setFilterVision] = useState(false);
  const [filterTools, setFilterTools] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url: string;
      if (tab === 'trending') {
        url = '/api/v1/models/trending?limit=50';
      } else {
        const params = new URLSearchParams();
        if (tab !== 'all') params.set('source', tab);
        if (search) params.set('search', search);
        if (filterVision) params.set('supportsVision', 'true');
        if (filterTools) params.set('supportsTools', 'true');
        params.set('limit', '200');
        url = `/api/v1/models/discovered?${params}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      } else {
        setError(`Failed to load models (${res.status})`);
      }
    } catch {
      setError('Failed to fetch models');
    }
    setLoading(false);
  }, [tab, search, filterVision, filterTools]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/v1/models/refresh', { method: 'POST' });
      setTimeout(() => { fetchModels(); setRefreshing(false); }, 3000);
    } catch {
      setRefreshing(false);
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/v1/models/discovered/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setModels(prev => prev.map(m => m.id === id ? { ...m, enabled } : m));
    } catch { /* ignore */ }
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    setSearch('');
  };

  return (
    <div className="me-page">
      <div className="me-header">
        <h2 className="me-title">Model Explorer</h2>
        <div className="me-header-right">
          <span className="me-count">{models.length} model{models.length !== 1 ? 's' : ''}</span>
          <button
            className="me-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="me-toolbar">
        <div className="me-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`me-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== 'trending' && (
          <input
            className="me-search"
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {tab !== 'trending' && (
        <div className="me-filters">
          <label className="me-filter-check">
            <input
              type="checkbox"
              checked={filterVision}
              onChange={(e) => setFilterVision(e.target.checked)}
            />
            Vision
          </label>
          <label className="me-filter-check">
            <input
              type="checkbox"
              checked={filterTools}
              onChange={(e) => setFilterTools(e.target.checked)}
            />
            Tools
          </label>
        </div>
      )}

      {loading ? (
        <div className="me-loading">Loading models...</div>
      ) : error ? (
        <div className="me-error">{error}</div>
      ) : models.length === 0 ? (
        <div className="me-empty">No models found. Try adjusting your filters or refreshing.</div>
      ) : (
        <div className="me-grid">
          {models.map(m => (
            <ModelCard key={m.id} model={m} onToggleEnabled={handleToggleEnabled} />
          ))}
        </div>
      )}
    </div>
  );
}
