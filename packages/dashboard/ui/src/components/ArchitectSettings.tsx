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
}

interface CorrectionStats {
  totalCorrections: number;
  topMisclassifications: Array<{ from: ContextDomain; to: ContextDomain; count: number }>;
  correctionRate: Record<string, number>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ArchitectSettings({
  loadPreferences,
  updatePreference,
  clearData,
  exportData,
}: ArchitectSettingsProps) {
  const [prefs, setPrefs] = useState<ArchitectPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadPreferences()
      .then(p => { setPrefs(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, [loadPreferences]);

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

  if (loading) return <div className="architect-settings-loading">Loading preferences...</div>;
  if (!prefs) return <div className="architect-settings-error">Failed to load preferences</div>;

  // Compute correction stats from prefs
  const totalInteractions = prefs.totalInteractions;
  const topDomains = Object.entries(prefs.contextUsageHistory)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3) as [ContextDomain, number][];

  return (
    <div className="architect-settings">
      <h3 className="architect-settings-title">The Architect Settings</h3>

      {status && <div className="architect-settings-status" role="status">{status}</div>}

      {/* Toggles */}
      <div className="architect-settings-section">
        <h4>Display</h4>

        <label className="architect-settings-toggle">
          <input
            type="checkbox"
            checked={prefs.showContextIndicator}
            onChange={e => handleToggle('showContextIndicator', e.target.checked)}
            disabled={saving}
          />
          <span>Show context indicator</span>
        </label>

        <label className="architect-settings-toggle">
          <input
            type="checkbox"
            checked={prefs.showSourcesButton}
            onChange={e => handleToggle('showSourcesButton', e.target.checked)}
            disabled={saving}
          />
          <span>Show sources button</span>
        </label>

        <label className="architect-settings-toggle">
          <input
            type="checkbox"
            checked={prefs.autoDetectContext}
            onChange={e => handleToggle('autoDetectContext', e.target.checked)}
            disabled={saving}
          />
          <span>Auto-detect context</span>
        </label>
      </div>

      {/* Default context */}
      <div className="architect-settings-section">
        <h4>Default Context</h4>
        <select
          className="architect-settings-select"
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

      {/* Detection accuracy */}
      <div className="architect-settings-section">
        <h4>Detection Accuracy</h4>
        <div className="architect-settings-stats">
          <div className="architect-settings-stat">
            <span className="architect-settings-stat-value">{totalInteractions}</span>
            <span className="architect-settings-stat-label">Total interactions</span>
          </div>
          {topDomains.length > 0 && (
            <div className="architect-settings-stat">
              <span className="architect-settings-stat-label">Most used contexts</span>
              <ul className="architect-settings-stat-list">
                {topDomains.map(([domain, count]) => (
                  <li key={domain}>
                    {DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label}: {count} ({totalInteractions > 0 ? Math.round(count / totalInteractions * 100) : 0}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Data management */}
      <div className="architect-settings-section">
        <h4>Data</h4>
        <div className="architect-settings-actions">
          {confirmClear ? (
            <div className="architect-settings-confirm">
              <span>Clear all learning data? This cannot be undone.</span>
              <button
                className="architect-settings-btn architect-settings-btn-danger"
                onClick={handleClear}
                disabled={saving}
              >
                Confirm clear
              </button>
              <button
                className="architect-settings-btn"
                onClick={() => setConfirmClear(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="architect-settings-btn architect-settings-btn-danger"
              onClick={() => setConfirmClear(true)}
              disabled={saving}
            >
              Clear learning data
            </button>
          )}
          <button
            className="architect-settings-btn"
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
