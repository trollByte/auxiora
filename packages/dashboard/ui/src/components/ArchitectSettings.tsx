import { useState, useEffect, useCallback } from 'react';
import type { ContextDomain, ArchitectPreferences } from '@auxiora/personality/architect';
import { DOMAIN_META, ALL_DOMAINS } from './context-meta.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArchitectSettingsProps {
  /** Load current preferences from the backend. */
  loadPreferences: () => Promise<ArchitectPreferences>;
  /** Update a single preference key. */
  updatePreference: (key: string, value: unknown) => Promise<void>;
  /** Clear all learning data. */
  clearData: () => Promise<void>;
  /** Export all data as JSON string. */
  exportData: () => Promise<string>;
  /** Get the current global personality engine. */
  getEngine?: () => Promise<string>;
  /** Set the global personality engine. */
  setEngine?: (engine: string) => Promise<void>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ArchitectSettings({
  loadPreferences,
  updatePreference,
  clearData,
  exportData,
  getEngine,
  setEngine,
}: ArchitectSettingsProps) {
  const [prefs, setPrefs] = useState<ArchitectPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState('');
  const [engineEnabled, setEngineEnabled] = useState(false);

  useEffect(() => {
    loadPreferences()
      .then(p => { setPrefs(p); setLoading(false); })
      .catch(() => setLoading(false));
    if (getEngine) {
      getEngine().then(e => setEngineEnabled(e === 'the-architect')).catch(() => {});
    }
  }, [loadPreferences, getEngine]);

  const handleEngineToggle = useCallback(async () => {
    if (!setEngine) return;
    setSaving(true);
    const newEngine = engineEnabled ? 'standard' : 'the-architect';
    try {
      await setEngine(newEngine);
      setEngineEnabled(!engineEnabled);
      setStatus(newEngine === 'the-architect' ? 'Architect engine enabled' : 'Architect engine disabled');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [engineEnabled, setEngine]);

  const handleToggle = useCallback(async (key: keyof ArchitectPreferences, value: boolean) => {
    if (!prefs) return;
    setSaving(true);
    try {
      await updatePreference(key, value);
      setPrefs({ ...prefs, [key]: value });
    } finally {
      setSaving(false);
    }
  }, [prefs, updatePreference]);

  const handleDefaultContext = useCallback(async (value: string) => {
    if (!prefs) return;
    setSaving(true);
    const domain = value === 'auto' ? null : value as ContextDomain;
    try {
      await updatePreference('defaultContext', domain);
      setPrefs({ ...prefs, defaultContext: domain });
    } finally {
      setSaving(false);
    }
  }, [prefs, updatePreference]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearData();
      setPrefs(await loadPreferences());
      setConfirmClear(false);
      setStatus('Learning data cleared');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [clearData, loadPreferences]);

  const handleExport = useCallback(async () => {
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `architect-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Data exported');
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setStatus('Export failed');
      setTimeout(() => setStatus(''), 3000);
    }
  }, [exportData]);

  if (loading) return null;
  if (!prefs) return <div className="error">Failed to load preferences</div>;

  const totalInteractions = prefs.totalInteractions;
  const topDomains = Object.entries(prefs.contextUsageHistory)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) as [ContextDomain, number][];

  return (
    <div className="settings-form">
      {status && <div className="settings-success" role="status">{status}</div>}

      {/* ── Global engine toggle ── */}
      {setEngine && (
        <div className="settings-section">
          <h3>Engine</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              className={`toggle${engineEnabled ? ' active' : ''}`}
              onClick={() => !saving && handleEngineToggle()}
              style={saving ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {engineEnabled ? 'Architect engine enabled (global default)' : 'Architect engine disabled'}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Controls the default personality for new chats. Individual chats can override this.
          </p>
        </div>
      )}

      {/* ── Display toggles ── */}
      <div className="settings-section">
        <h3>Display</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div
            className={`toggle${prefs.showContextIndicator ? ' active' : ''}`}
            onClick={() => !saving && handleToggle('showContextIndicator', !prefs.showContextIndicator)}
            style={saving ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            Show context indicator
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div
            className={`toggle${prefs.showSourcesButton ? ' active' : ''}`}
            onClick={() => !saving && handleToggle('showSourcesButton', !prefs.showSourcesButton)}
            style={saving ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            Show sources button
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            className={`toggle${prefs.autoDetectContext ? ' active' : ''}`}
            onClick={() => !saving && handleToggle('autoDetectContext', !prefs.autoDetectContext)}
            style={saving ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            Auto-detect context
          </span>
        </div>
      </div>

      {/* ── Default context ── */}
      <div className="settings-section">
        <h3>Default Context</h3>
        <label>Context domain</label>
        <select
          value={prefs.defaultContext ?? 'auto'}
          onChange={e => handleDefaultContext(e.target.value)}
          disabled={saving}
        >
          <option value="auto">Auto (detect from message)</option>
          {ALL_DOMAINS.map(domain => (
            <option key={domain} value={domain}>
              {DOMAIN_META[domain].icon} {DOMAIN_META[domain].label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Detection stats ── */}
      <div className="settings-section">
        <h3>Detection Stats</h3>
        <div className="status-grid" style={{ marginBottom: '1rem' }}>
          <div className="status-card">
            <h3>Total</h3>
            <div className="value">{totalInteractions}</div>
            <div className="sub">interactions</div>
          </div>
          {topDomains.slice(0, 3).map(([domain, count]) => (
            <div className="status-card" key={domain}>
              <h3>{DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label}</h3>
              <div className="value">{count}</div>
              <div className="sub">{totalInteractions > 0 ? Math.round(count / totalInteractions * 100) : 0}% of total</div>
            </div>
          ))}
        </div>
        {topDomains.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            No interactions recorded yet. Context stats will appear here as you use The Architect.
          </p>
        )}
      </div>

      {/* ── Data management ── */}
      <div className="settings-section" style={{ borderBottom: 'none' }}>
        <h3>Data Management</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {confirmClear ? (
            <>
              <span style={{ fontSize: '0.85rem', color: 'var(--danger)', marginRight: '0.25rem' }}>
                Clear all learning data? This cannot be undone.
              </span>
              <button
                className="btn-sm btn-danger"
                onClick={handleClear}
                disabled={saving}
              >
                Confirm
              </button>
              <button
                className="btn-sm"
                onClick={() => setConfirmClear(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn-sm btn-danger"
              onClick={() => setConfirmClear(true)}
              disabled={saving}
            >
              Clear learning data
            </button>
          )}
          <button
            className="btn-sm"
            onClick={handleExport}
            disabled={saving}
          >
            Export data
          </button>
        </div>
      </div>
    </div>
  );
}
