import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';

/* ---------- Types ---------- */

interface ToneValues {
  warmth: number;
  directness: number;
  humor: number;
  formality: number;
}

interface Boundaries {
  neverJokeAbout: string[];
  neverAdviseOn: string[];
}

interface PersonalityData {
  name: string;
  pronouns: string;
  avatar: string | null;
  vibe: string;
  tone: ToneValues;
  errorStyle: string;
  expertise: string[];
  catchphrases: Record<string, string>;
  boundaries: Boundaries;
  customInstructions: string;
  soulContent: string | null;
  activeTemplate: string | null;
}

const ERROR_STYLES = [
  'professional',
  'apologetic',
  'matter_of_fact',
  'self_deprecating',
  'gentle',
  'detailed',
  'encouraging',
  'terse',
  'educational',
] as const;

const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'it/its'] as const;

const CATCHPHRASE_KEYS = ['greeting', 'farewell', 'thinking', 'success', 'error'] as const;

const TONE_CONFIG: Array<{
  key: keyof ToneValues;
  label: string;
  low: string;
  high: string;
}> = [
  { key: 'warmth', label: 'Warmth', low: 'Reserved', high: 'Warm' },
  { key: 'directness', label: 'Directness', low: 'Gentle', high: 'Direct' },
  { key: 'humor', label: 'Humor', low: 'Serious', high: 'Playful' },
  { key: 'formality', label: 'Formality', low: 'Casual', high: 'Formal' },
];

/* ---------- Inline helper components ---------- */

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.trim();
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="tag-input-container">
      <div className="tag-list">
        {tags.map((tag, i) => (
          <span key={i} className="tag">
            {tag}
            <button
              type="button"
              className="tag-remove"
              onClick={() => removeTag(i)}
              aria-label={`Remove ${tag}`}
            >
              x
            </button>
          </span>
        ))}
      </div>
      <input
        className="tag-input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Type and press Enter'}
      />
    </div>
  );
}

function ToneSlider({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);

  return (
    <div className="tone-slider">
      <div className="tone-slider-header">
        <span className="tone-label">{label}</span>
        <span className="tone-value">{pct}%</span>
      </div>
      <div className="tone-slider-row">
        <span className="tone-extreme">{low}</span>
        <input
          className="slider"
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
        />
        <span className="tone-extreme">{high}</span>
      </div>
    </div>
  );
}

/* ---------- Main component ---------- */

const DEFAULT_DATA: PersonalityData = {
  name: '',
  pronouns: 'they/them',
  avatar: null,
  vibe: '',
  tone: { warmth: 0.5, directness: 0.5, humor: 0.5, formality: 0.5 },
  errorStyle: 'professional',
  expertise: [],
  catchphrases: { greeting: '', farewell: '', thinking: '', success: '', error: '' },
  boundaries: { neverJokeAbout: [], neverAdviseOn: [] },
  customInstructions: '',
  soulContent: null,
  activeTemplate: null,
};

export function PersonalityEditor() {
  /* --- Server data (snapshot of last saved state) --- */
  const [serverData, setServerData] = useState<PersonalityData | null>(null);

  /* --- Editable form state --- */
  const [form, setForm] = useState<PersonalityData>(DEFAULT_DATA);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showSoul, setShowSoul] = useState(false);

  /* --- UI state --- */
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  /* --- Load personality data --- */
  useEffect(() => {
    api.getPersonalityFull()
      .then((res) => {
        const d = res.data;
        const loaded: PersonalityData = {
          name: d.name ?? '',
          pronouns: d.pronouns ?? 'they/them',
          avatar: d.avatar ?? null,
          vibe: d.vibe ?? '',
          tone: d.tone ?? { warmth: 0.5, directness: 0.5, humor: 0.5, formality: 0.5 },
          errorStyle: d.errorStyle ?? 'professional',
          expertise: d.expertise ?? [],
          catchphrases: {
            greeting: d.catchphrases?.greeting ?? '',
            farewell: d.catchphrases?.farewell ?? '',
            thinking: d.catchphrases?.thinking ?? '',
            success: d.catchphrases?.success ?? '',
            error: d.catchphrases?.error ?? '',
          },
          boundaries: {
            neverJokeAbout: d.boundaries?.neverJokeAbout ?? [],
            neverAdviseOn: d.boundaries?.neverAdviseOn ?? [],
          },
          customInstructions: d.customInstructions ?? '',
          soulContent: d.soulContent ?? null,
          activeTemplate: d.activeTemplate ?? null,
        };
        setForm(loaded);
        setServerData(loaded);
        setSelectedTemplate(loaded.activeTemplate);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  /* --- Templates --- */
  const { data: templatesRes, loading: templatesLoading } = useApi(
    () => api.getTemplates(),
    [],
  );
  const templates = templatesRes?.data ?? [];

  /* --- Dirty detection --- */
  const isDirty = useCallback((): boolean => {
    if (!serverData) return false;
    if (selectedTemplate !== serverData.activeTemplate) return true;
    return JSON.stringify(form) !== JSON.stringify(serverData);
  }, [form, serverData, selectedTemplate]);

  const dirty = isDirty();

  /* --- Field updaters --- */
  const updateField = <K extends keyof PersonalityData>(key: K, value: PersonalityData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateTone = (key: keyof ToneValues, value: number) => {
    setForm((prev) => ({ ...prev, tone: { ...prev.tone, [key]: value } }));
  };

  const updateCatchphrase = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      catchphrases: { ...prev.catchphrases, [key]: value },
    }));
  };

  const updateBoundary = (key: keyof Boundaries, value: string[]) => {
    setForm((prev) => ({
      ...prev,
      boundaries: { ...prev.boundaries, [key]: value },
    }));
  };

  /* --- Save handler --- */
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        pronouns: form.pronouns,
        avatar: form.avatar,
        vibe: form.vibe,
        tone: form.tone,
        errorStyle: form.errorStyle,
        expertise: form.expertise,
        catchphrases: form.catchphrases,
        boundaries: form.boundaries,
        customInstructions: form.customInstructions,
        soulContent: form.soulContent,
      };
      if (selectedTemplate !== serverData?.activeTemplate) {
        payload.activeTemplate = selectedTemplate;
      }
      await api.updatePersonalityFull(payload);
      const saved: PersonalityData = {
        ...form,
        activeTemplate: selectedTemplate,
      };
      setServerData(saved);
      setSuccess('Personality settings saved successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /* --- Avatar preview validity --- */
  const [avatarValid, setAvatarValid] = useState(false);
  useEffect(() => {
    if (!form.avatar) {
      setAvatarValid(false);
      return;
    }
    try {
      new URL(form.avatar);
      setAvatarValid(true);
    } catch {
      setAvatarValid(false);
    }
  }, [form.avatar]);

  /* --- Render --- */

  if (loadError) {
    return (
      <div className="personality-editor">
        <div className="error">Failed to load personality data: {loadError}</div>
      </div>
    );
  }

  if (!serverData) {
    return (
      <div className="personality-editor">
        <p>Loading personality settings...</p>
      </div>
    );
  }

  const saveButton = (
    <button
      className="btn-primary"
      onClick={handleSave}
      disabled={saving || !dirty}
    >
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
  );

  return (
    <div className="personality-editor">
      {/* Header */}
      <div className="page-header">
        <h2>Personality Editor</h2>
        {dirty && saveButton}
      </div>

      {success && <div className="settings-success">{success}</div>}
      {error && <div className="error">{error}</div>}

      {/* Section 1: Identity */}
      <div className="editor-section">
        <h3>Identity</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Agent name"
            />
          </div>

          <div className="form-field">
            <label>Pronouns</label>
            <select
              value={form.pronouns}
              onChange={(e) => updateField('pronouns', e.target.value)}
            >
              {PRONOUN_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="form-field full-width">
            <label>Vibe</label>
            <input
              type="text"
              value={form.vibe}
              onChange={(e) => {
                if (e.target.value.length <= 200) {
                  updateField('vibe', e.target.value);
                }
              }}
              placeholder="A short description of the assistant's personality vibe"
              maxLength={200}
            />
            <span className="field-hint">{form.vibe.length}/200 characters</span>
          </div>

          <div className="form-field full-width">
            <label>Avatar URL</label>
            <input
              type="text"
              value={form.avatar ?? ''}
              onChange={(e) => updateField('avatar', e.target.value || null)}
              placeholder="https://example.com/avatar.png"
            />
            {avatarValid && form.avatar && (
              <img
                src={form.avatar}
                alt="Avatar preview"
                style={{ width: 64, height: 64, borderRadius: 8, marginTop: 8, objectFit: 'cover' }}
                onError={() => setAvatarValid(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Tone */}
      <div className="editor-section">
        <h3>Tone</h3>
        <div className="tone-sliders">
          {TONE_CONFIG.map((tc) => (
            <ToneSlider
              key={tc.key}
              label={tc.label}
              low={tc.low}
              high={tc.high}
              value={form.tone[tc.key]}
              onChange={(v) => updateTone(tc.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Section 3: Quick Start Templates */}
      <div className="editor-section">
        <h3>Quick Start Templates</h3>
        {templatesLoading && <p>Loading templates...</p>}
        <div className="template-grid">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`template-card${selectedTemplate === t.id ? ' selected' : ''}`}
              onClick={() => setSelectedTemplate(t.id)}
            >
              <h4>{t.name}</h4>
              <p>{t.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Behavior */}
      <div className="editor-section">
        <h3>Behavior</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Error Style</label>
            <select
              value={form.errorStyle}
              onChange={(e) => updateField('errorStyle', e.target.value)}
            >
              {ERROR_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field full-width">
            <label>Expertise Areas</label>
            <TagInput
              tags={form.expertise}
              onChange={(tags) => updateField('expertise', tags)}
              placeholder="Add expertise area and press Enter"
            />
          </div>

          <div className="form-field full-width">
            <label>Catchphrases</label>
            <div className="catchphrase-grid">
              {CATCHPHRASE_KEYS.map((key) => (
                <div key={key} className="catchphrase-row">
                  <span className="catchphrase-label">{key}</span>
                  <input
                    type="text"
                    value={form.catchphrases[key] ?? ''}
                    onChange={(e) => updateCatchphrase(key, e.target.value)}
                    placeholder={`${key} phrase`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="form-field full-width">
            <label>Never Joke About</label>
            <TagInput
              tags={form.boundaries.neverJokeAbout}
              onChange={(tags) => updateBoundary('neverJokeAbout', tags)}
              placeholder="Add topic and press Enter"
            />
          </div>

          <div className="form-field full-width">
            <label>Never Advise On</label>
            <TagInput
              tags={form.boundaries.neverAdviseOn}
              onChange={(tags) => updateBoundary('neverAdviseOn', tags)}
              placeholder="Add topic and press Enter"
            />
          </div>
        </div>
      </div>

      {/* Section 5: Custom Instructions */}
      <div className="editor-section">
        <h3>Custom Instructions</h3>
        <div className="form-field full-width">
          <textarea
            className="custom-instructions-textarea"
            rows={6}
            value={form.customInstructions}
            onChange={(e) => {
              if (e.target.value.length <= 4000) {
                updateField('customInstructions', e.target.value);
              }
            }}
            maxLength={4000}
            placeholder="Add any custom instructions for the assistant..."
          />
          <span className="field-hint">
            {form.customInstructions.length}/4000 characters. These instructions are always
            included in the system prompt and guide the assistant's overall behavior.
          </span>
        </div>
      </div>

      {/* Section 6: Advanced — Raw SOUL.md */}
      <div className="editor-section">
        <h3>
          Advanced
          <button
            type="button"
            className="section-toggle"
            onClick={() => setShowSoul(!showSoul)}
          >
            {showSoul ? 'Hide' : 'Show'} Raw SOUL.md
          </button>
        </h3>
        {showSoul && (
          <>
            <p className="field-hint" style={{ marginBottom: '0.5rem' }}>
              Warning: selecting a template will overwrite manual edits to this content.
            </p>
            <textarea
              className="soul-editor-textarea"
              rows={16}
              value={form.soulContent ?? ''}
              onChange={(e) => updateField('soulContent', e.target.value || null)}
              placeholder="Raw SOUL.md content..."
              style={{ fontFamily: 'monospace' }}
            />
          </>
        )}
      </div>

      {/* Sticky footer */}
      {dirty && (
        <div className="editor-footer">
          {saveButton}
        </div>
      )}
    </div>
  );
}
