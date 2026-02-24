import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

const CATEGORIES = ['all', 'preference', 'fact', 'context', 'relationship', 'pattern', 'personality'] as const;

const CATEGORY_CLASS: Record<string, string> = {
  preference: 'mm-badge-accent',
  fact: 'mm-badge-blue',
  context: 'mm-badge-gray',
  relationship: 'mm-badge-green',
  pattern: 'mm-badge-amber',
  personality: 'mm-badge-purple',
};

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Memory {
  id: string;
  content: string;
  category: string;
  importance: number;
  tags: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  confidence: number;
}

export function MemoryManager() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImportance, setEditImportance] = useState(0);
  const [editTags, setEditTags] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [forgetTopic, setForgetTopic] = useState('');
  const [forgetResult, setForgetResult] = useState<string | null>(null);
  const [forgetLoading, setForgetLoading] = useState(false);

  const fetchMemories = useCallback(() => {
    setLoading(true);
    setError(null);
    const cat = category === 'all' ? undefined : category;
    const promise = search
      ? api.searchMemories(search)
      : api.getMemories(cat);
    promise
      .then(res => { setMemories(res.data); setLoading(false); })
      .catch(err => { setError(err instanceof Error ? err.message : String(err)); setLoading(false); });
  }, [category, search]);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  function startEdit(mem: Memory) {
    setEditingId(mem.id);
    setEditContent(mem.content);
    setEditImportance(mem.importance);
    setEditTags(mem.tags.join(', '));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: string) {
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    api.updateMemory(id, { content: editContent, importance: editImportance, tags })
      .then(() => { setEditingId(null); fetchMemories(); })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }

  function deleteMemory(id: string) {
    api.deleteMemory(id)
      .then(() => { setConfirmDeleteId(null); fetchMemories(); })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }

  function handleForget() {
    if (!forgetTopic.trim()) return;
    setForgetLoading(true);
    setForgetResult(null);
    api.forgetTopic(forgetTopic.trim())
      .then(res => {
        setForgetResult(`Removed ${res.removed.memories} memories and ${res.removed.decisions} decisions.`);
        setForgetTopic('');
        setForgetLoading(false);
        fetchMemories();
      })
      .catch(err => {
        setForgetResult(err instanceof Error ? err.message : String(err));
        setForgetLoading(false);
      });
  }

  function handleExport() {
    api.exportPersonalization()
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `auxiora-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }

  if (loading) {
    return <div className="mm-page"><div className="mm-loading">Loading memories...</div></div>;
  }

  if (error) {
    return (
      <div className="mm-page">
        <div className="mm-header">
          <h2 className="mm-title">Memories</h2>
        </div>
        <div className="mm-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="mm-page">
      <div className="mm-header">
        <h2 className="mm-title">Memories</h2>
        <input
          className="mm-search"
          type="text"
          placeholder="Search memories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="mm-filter"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
          ))}
        </select>
      </div>

      {memories.length === 0 ? (
        <div className="mm-empty">No memories yet</div>
      ) : (
        <div className="mm-grid">
          {memories.map(mem => (
            <div key={mem.id} className="mm-card">
              {editingId === mem.id ? (
                <div className="mm-edit-form">
                  <textarea
                    className="mm-edit-content"
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                  />
                  <label className="mm-edit-label">
                    Importance ({editImportance.toFixed(2)})
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={editImportance}
                      onChange={e => setEditImportance(Number(e.target.value))}
                      className="mm-edit-slider"
                    />
                  </label>
                  <label className="mm-edit-label">
                    Tags (comma-separated)
                    <input
                      type="text"
                      className="mm-edit-tags-input"
                      value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                    />
                  </label>
                  <div className="mm-edit-actions">
                    <button className="mm-btn mm-btn-save" onClick={() => saveEdit(mem.id)}>Save</button>
                    <button className="mm-btn mm-btn-cancel" onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`mm-content ${expandedId === mem.id ? 'mm-content-expanded' : ''}`}
                    onClick={() => setExpandedId(expandedId === mem.id ? null : mem.id)}
                  >
                    {mem.content}
                  </div>
                  <div className="mm-meta-row">
                    <span className={`mm-category-badge ${CATEGORY_CLASS[mem.category] || 'mm-badge-gray'}`}>
                      {mem.category}
                    </span>
                    <span className="mm-source-badge">{mem.source}</span>
                  </div>
                  <div className="mm-importance-track">
                    <div
                      className="mm-importance-bar"
                      data-level={mem.importance >= 0.7 ? 'high' : mem.importance >= 0.4 ? 'mid' : 'low'}
                      style={{ width: `${Math.round(mem.importance * 100)}%` }}
                      role="progressbar"
                      aria-valuenow={mem.importance}
                      aria-valuemin={0}
                      aria-valuemax={1}
                      aria-label={`Importance: ${Math.round(mem.importance * 100)}%`}
                    />
                  </div>
                  {mem.tags.length > 0 && (
                    <div className="mm-tags">
                      {mem.tags.map(tag => (
                        <span key={tag} className="mm-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="mm-timestamps">
                    <span>Created {formatDateTime(mem.createdAt)}</span>
                    <span>Updated {formatDateTime(mem.updatedAt)}</span>
                  </div>
                  <div className="mm-card-actions">
                    {confirmDeleteId === mem.id ? (
                      <>
                        <span className="mm-confirm-text">Delete?</span>
                        <button className="mm-btn mm-btn-danger" onClick={() => deleteMemory(mem.id)}>Yes</button>
                        <button className="mm-btn mm-btn-cancel" onClick={() => setConfirmDeleteId(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="mm-btn mm-btn-edit" onClick={() => startEdit(mem)}>Edit</button>
                        <button className="mm-btn mm-btn-delete" onClick={() => setConfirmDeleteId(mem.id)}>Delete</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="mm-forget-section">
        <h3 className="mm-section-title">Selective Forgetting</h3>
        <p className="mm-section-desc">Remove all memories and decisions related to a topic.</p>
        <div className="mm-forget-row">
          <input
            className="mm-forget-input"
            type="text"
            placeholder="Topic to forget..."
            value={forgetTopic}
            onChange={e => setForgetTopic(e.target.value)}
          />
          <button
            className="mm-btn mm-btn-danger"
            onClick={handleForget}
            disabled={forgetLoading || !forgetTopic.trim()}
          >
            {forgetLoading ? 'Forgetting...' : 'Forget'}
          </button>
        </div>
        {forgetResult && <div className="mm-forget-result">{forgetResult}</div>}
      </section>

      <section className="mm-export-section">
        <h3 className="mm-section-title">Export Data</h3>
        <p className="mm-section-desc">Download all personalization data as JSON.</p>
        <button className="mm-btn mm-btn-export" onClick={handleExport}>Export All Data</button>
      </section>
    </div>
  );
}
