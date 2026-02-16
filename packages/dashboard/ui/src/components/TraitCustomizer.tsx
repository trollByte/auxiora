import { useState, useEffect, useCallback } from 'react';
import type { TraitMix, WeightPreset } from '@auxiora/personality/architect';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TraitCustomizerProps {
  /** Get current trait overrides from the backend. */
  getOverrides: () => Promise<Partial<Record<keyof TraitMix, number>>>;
  /** Set a trait override. */
  setOverride: (trait: keyof TraitMix, offset: number) => Promise<void>;
  /** Remove a trait override. */
  removeOverride: (trait: keyof TraitMix) => Promise<void>;
  /** Load a preset. */
  loadPreset: (presetName: string) => Promise<void>;
  /** Get available presets. */
  listPresets: () => Record<string, WeightPreset>;
}

// ── Trait metadata ───────────────────────────────────────────────────────────

interface TraitInfo {
  key: keyof TraitMix;
  label: string;
  source: string;
  category: string;
}

const TRAIT_INFO: TraitInfo[] = [
  // Thinking
  { key: 'inversion', label: 'Inversion', source: 'Munger', category: 'Thinking' },
  { key: 'firstPrinciples', label: 'First Principles', source: 'Musk/Newton', category: 'Thinking' },
  { key: 'mentalSimulation', label: 'Mental Simulation', source: 'Tesla', category: 'Thinking' },
  { key: 'adversarialThinking', label: 'Adversarial Thinking', source: 'Grove/Sun Tzu', category: 'Thinking' },
  { key: 'secondOrder', label: 'Second-Order Thinking', source: 'Marks', category: 'Thinking' },
  { key: 'systemsView', label: 'Systems View', source: 'Fuller/Shannon', category: 'Thinking' },
  // Communication
  { key: 'simplification', label: 'Simplification', source: 'Jobs/Shannon', category: 'Communication' },
  { key: 'storytelling', label: 'Storytelling', source: 'Cialdini', category: 'Communication' },
  { key: 'tacticalEmpathy', label: 'Tactical Empathy', source: 'Voss', category: 'Communication' },
  { key: 'genuineCuriosity', label: 'Genuine Curiosity', source: 'Carnegie', category: 'Communication' },
  { key: 'radicalCandor', label: 'Radical Candor', source: 'Scott', category: 'Communication' },
  // Leadership
  { key: 'standardSetting', label: 'Standard Setting', source: 'Wooden/Walsh', category: 'Leadership' },
  { key: 'developmentalCoaching', label: 'Developmental Coaching', source: 'Wooden', category: 'Leadership' },
  { key: 'strategicGenerosity', label: 'Strategic Generosity', source: 'Grant/Franklin', category: 'Leadership' },
  { key: 'stoicCalm', label: 'Stoic Calm', source: 'Aurelius', category: 'Leadership' },
  { key: 'paranoidVigilance', label: 'Paranoid Vigilance', source: 'Grove', category: 'Leadership' },
  // Execution
  { key: 'valueEquation', label: 'Value Equation', source: 'Hormozi', category: 'Execution' },
  { key: 'ooda', label: 'OODA Loop', source: 'Boyd', category: 'Execution' },
  { key: 'buildForChange', label: 'Build for Change', source: 'Fowler/Beck', category: 'Execution' },
  { key: 'humanCenteredDesign', label: 'Human-Centered Design', source: 'Norman', category: 'Execution' },
  { key: 'constraintCreativity', label: 'Constraint Creativity', source: 'Eames', category: 'Execution' },
  // Decision
  { key: 'regretMinimization', label: 'Regret Minimization', source: 'Bezos', category: 'Decision' },
  { key: 'doorClassification', label: 'Door Classification', source: 'Bezos', category: 'Decision' },
  { key: 'probabilistic', label: 'Probabilistic Thinking', source: 'Duke', category: 'Decision' },
  { key: 'plannedAbandonment', label: 'Planned Abandonment', source: 'Drucker', category: 'Decision' },
  // Tone
  { key: 'warmth', label: 'Warmth', source: 'Composite', category: 'Tone' },
  { key: 'urgency', label: 'Urgency', source: 'Composite', category: 'Tone' },
  { key: 'humor', label: 'Humor', source: 'Composite', category: 'Tone' },
  { key: 'verbosity', label: 'Verbosity', source: 'Composite', category: 'Tone' },
];

const CATEGORIES = ['Thinking', 'Communication', 'Leadership', 'Execution', 'Decision', 'Tone'];

// ── Component ────────────────────────────────────────────────────────────────

export function TraitCustomizer({
  getOverrides,
  setOverride,
  removeOverride,
  loadPreset,
  listPresets,
}: TraitCustomizerProps) {
  const [overrides, setOverrides] = useState<Partial<Record<keyof TraitMix, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('custom');
  const [status, setStatus] = useState('');
  const presets = listPresets();

  useEffect(() => {
    getOverrides()
      .then(o => { setOverrides(o); setLoading(false); detectPreset(o); })
      .catch(() => setLoading(false));
  }, [getOverrides]);

  const detectPreset = useCallback((current: Partial<Record<keyof TraitMix, number>>) => {
    for (const [key, preset] of Object.entries(presets)) {
      const overrideEntries = Object.entries(preset.overrides);
      const currentEntries = Object.entries(current);
      if (overrideEntries.length !== currentEntries.length) continue;

      const matches = overrideEntries.every(([trait, val]) =>
        current[trait as keyof TraitMix] === val,
      );
      if (matches) {
        setActivePreset(key);
        return;
      }
    }
    setActivePreset('custom');
  }, [presets]);

  const handleSliderChange = useCallback(async (trait: keyof TraitMix, value: number) => {
    setSaving(true);
    try {
      if (value === 0) {
        await removeOverride(trait);
        setOverrides(prev => {
          const next = { ...prev };
          delete next[trait];
          detectPreset(next);
          return next;
        });
      } else {
        await setOverride(trait, value);
        setOverrides(prev => {
          const next = { ...prev, [trait]: value };
          detectPreset(next);
          return next;
        });
      }
    } finally {
      setSaving(false);
    }
  }, [setOverride, removeOverride, detectPreset]);

  const handlePresetLoad = useCallback(async (presetName: string) => {
    setSaving(true);
    try {
      await loadPreset(presetName);
      const fresh = await getOverrides();
      setOverrides(fresh);
      setActivePreset(presetName);
      setStatus(`Loaded ${presets[presetName].name}`);
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [loadPreset, getOverrides, presets]);

  const handleResetAll = useCallback(async () => {
    setSaving(true);
    try {
      const allTraits = Object.keys(overrides) as Array<keyof TraitMix>;
      for (const trait of allTraits) {
        await removeOverride(trait);
      }
      setOverrides({});
      setActivePreset('custom');
      setStatus('All overrides cleared');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [overrides, removeOverride]);

  if (loading) return <div className="trait-customizer-loading">Loading trait settings...</div>;

  return (
    <div className="trait-customizer">
      <h3 className="trait-customizer-title">Trait Customizer</h3>

      {status && <div className="trait-customizer-status" role="status">{status}</div>}

      {/* Active Preset */}
      <div className="trait-customizer-section">
        <h4>Active Preset</h4>
        <select
          className="trait-customizer-select"
          value={activePreset}
          onChange={e => {
            if (e.target.value !== 'custom') handlePresetLoad(e.target.value);
          }}
          disabled={saving}
        >
          <option value="custom">Custom</option>
          {Object.entries(presets).map(([key, preset]) => (
            <option key={key} value={key}>{preset.name}</option>
          ))}
        </select>
      </div>

      {/* Trait Adjustments */}
      <div className="trait-customizer-section">
        <h4>Trait Adjustments</h4>
        {CATEGORIES.map(category => (
          <div key={category} className="trait-customizer-group">
            <h5 className="trait-customizer-group-label">{category}</h5>
            {TRAIT_INFO.filter(t => t.category === category).map(trait => (
              <div key={trait.key} className="trait-customizer-row">
                <div className="trait-customizer-label">
                  <span className="trait-customizer-name">{trait.label}</span>
                  <span className="trait-customizer-source">({trait.source})</span>
                </div>
                <div className="trait-customizer-control">
                  <input
                    type="range"
                    className="trait-customizer-slider"
                    min={-0.3}
                    max={0.3}
                    step={0.05}
                    value={overrides[trait.key] ?? 0}
                    onChange={e => handleSliderChange(trait.key, parseFloat(e.target.value))}
                    disabled={saving}
                  />
                  <span className="trait-customizer-value">
                    {(overrides[trait.key] ?? 0) >= 0 ? '+' : ''}
                    {(overrides[trait.key] ?? 0).toFixed(2)}
                  </span>
                  {overrides[trait.key] !== undefined && (
                    <button
                      className="trait-customizer-reset-btn"
                      onClick={() => handleSliderChange(trait.key, 0)}
                      disabled={saving}
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Quick Presets */}
      <div className="trait-customizer-section">
        <h4>Quick Presets</h4>
        <div className="trait-customizer-presets">
          {Object.entries(presets).map(([key, preset]) => (
            <div
              key={key}
              className={`trait-customizer-preset-card${activePreset === key ? ' trait-customizer-preset-card-active' : ''}`}
            >
              <div className="trait-customizer-preset-name">{preset.name}</div>
              <div className="trait-customizer-preset-desc">{preset.description}</div>
              <button
                className="trait-customizer-btn"
                onClick={() => handlePresetLoad(key)}
                disabled={saving}
              >
                Apply
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Global actions */}
      <div className="trait-customizer-section">
        <button
          className="trait-customizer-btn trait-customizer-btn-danger"
          onClick={handleResetAll}
          disabled={saving || Object.keys(overrides).length === 0}
        >
          Reset All to Default
        </button>
      </div>
    </div>
  );
}
