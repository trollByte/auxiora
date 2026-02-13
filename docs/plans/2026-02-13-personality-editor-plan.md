# Personality Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance Auxiora's personality system with avatar, vibe, and custom instructions fields, and build a unified dashboard personality editor that merges the current Identity and Personality settings pages.

**Architecture:** Extend `AgentIdentitySchema` in `packages/config` with three new fields. Update `PromptAssembler` in `packages/personality` to inject vibe and custom instructions into the system prompt. Add a new `GET /api/personality/full` + `PUT /api/personality/full` endpoint pair in the dashboard router. Build a new `PersonalityEditor.tsx` page that replaces both `SettingsIdentity` and `SettingsPersonality` with a unified editor featuring sliders, tag inputs, avatar upload, and a personality preview.

**Tech Stack:** TypeScript, React, Zod, Vite, existing personality/config packages, vitest for tests.

---

### Task 1: Extend AgentIdentity schema with new fields

**Files:**
- Modify: `packages/config/src/index.ts:270-293`
- Test: `packages/config/tests/config.test.ts` (if exists, else manual verification)

**Step 1: Add avatar, vibe, and customInstructions to AgentIdentitySchema**

Open `packages/config/src/index.ts` and find the `AgentIdentitySchema` definition (line ~270). Add three new optional fields after `pronouns`:

```typescript
const AgentIdentitySchema = z.object({
  name: z.string().default('Auxiora'),
  pronouns: z.string().default('they/them'),
  avatar: z.string().optional(),
  vibe: z.string().max(200).optional(),
  customInstructions: z.string().max(4000).optional(),
  personality: z.string().default('professional'),
  tone: z.object({
    warmth: z.number().min(0).max(1).default(0.6),
    directness: z.number().min(0).max(1).default(0.5),
    humor: z.number().min(0).max(1).default(0.3),
    formality: z.number().min(0).max(1).default(0.5),
  }).default({}),
  expertise: z.array(z.string()).default([]),
  errorStyle: z.enum(['apologetic', 'matter_of_fact', 'self_deprecating', 'professional', 'gentle', 'detailed', 'encouraging', 'terse', 'educational']).default('professional'),
  catchphrases: z.object({
    greeting: z.string().optional(),
    farewell: z.string().optional(),
    thinking: z.string().optional(),
    success: z.string().optional(),
    error: z.string().optional(),
  }).default({}),
  boundaries: z.object({
    neverJokeAbout: z.array(z.string()).default([]),
    neverAdviseOn: z.array(z.string()).default([]),
  }).default({}),
});
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/config/tsconfig.json`
Expected: Clean compile, no errors.

**Step 3: Commit**

```bash
git add packages/config/src/index.ts
git commit -m "feat(config): add avatar, vibe, customInstructions to AgentIdentity schema"
```

---

### Task 2: Update PromptAssembler to inject vibe and custom instructions

**Files:**
- Modify: `packages/personality/src/modes/prompt-assembler.ts:225-267` (buildIdentityPreamble) and `:31-83` (buildBase)
- Test: `packages/personality/src/modes/__tests__/prompt-assembler.test.ts`

**Step 1: Write failing tests**

Add tests to `packages/personality/src/modes/__tests__/prompt-assembler.test.ts`:

```typescript
it('includes vibe in identity preamble when set', async () => {
  const agent = {
    ...baseAgent,
    vibe: 'warm, witty, slightly sarcastic',
  };
  const assembler = new PromptAssembler(agent as any, modeLoader);
  const prompt = await assembler.buildBase();
  expect(prompt).toContain('Vibe: warm, witty, slightly sarcastic');
});

it('includes custom instructions after SOUL.md', async () => {
  const agent = {
    ...baseAgent,
    customInstructions: 'Always end responses with a relevant emoji.',
  };
  const assembler = new PromptAssembler(agent as any, modeLoader);
  const prompt = await assembler.buildBase();
  expect(prompt).toContain('Always end responses with a relevant emoji.');
});

it('omits vibe line when vibe is undefined', async () => {
  const agent = { ...baseAgent };
  delete (agent as any).vibe;
  const assembler = new PromptAssembler(agent as any, modeLoader);
  const prompt = await assembler.buildBase();
  expect(prompt).not.toContain('Vibe:');
});
```

Where `baseAgent` is the existing test fixture — look at the existing tests in the file for the pattern.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/personality/src/modes/__tests__/prompt-assembler.test.ts`
Expected: New tests FAIL (vibe/customInstructions not yet implemented).

**Step 3: Implement vibe in buildIdentityPreamble**

In `packages/personality/src/modes/prompt-assembler.ts`, find the `buildIdentityPreamble` method (line ~225). After the `You are ${agent.name}` line, add:

```typescript
if ((agent as any).vibe) {
  lines.push(`Vibe: ${(agent as any).vibe}`);
}
```

Note: The `AgentIdentity` type from `@auxiora/config` should already have the `vibe` field from Task 1. If the import resolves correctly, use `agent.vibe` directly without the cast. If the build has a type mismatch, use `(agent as any).vibe` as a temporary workaround.

**Step 4: Implement customInstructions in buildBase**

In the `buildBase()` method (line ~31), after the SOUL.md section (after the `} catch { // No SOUL.md }` block around line 51), add:

```typescript
    // 3b. Custom instructions from config
    if ((this.agent as any).customInstructions) {
      parts.push(`## Custom Instructions\n${(this.agent as any).customInstructions}`);
    }
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/personality/src/modes/__tests__/prompt-assembler.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add packages/personality/src/modes/prompt-assembler.ts packages/personality/src/modes/__tests__/prompt-assembler.test.ts
git commit -m "feat(personality): inject vibe and customInstructions into system prompt"
```

---

### Task 3: Add full personality API endpoints

**Files:**
- Modify: `packages/dashboard/src/router.ts:606-667`
- Modify: `packages/dashboard/ui/src/api.ts`

**Step 1: Add GET /personality/full endpoint**

In `packages/dashboard/src/router.ts`, after the existing `router.get('/identity', ...)` handler (line ~610), add a new endpoint:

```typescript
  // Full personality state for the editor
  router.get('/personality/full', async (req: Request, res: Response) => {
    const agent = deps.config.agent ?? {};
    let soulContent: string | null = null;
    try {
      soulContent = await fs.readFile(getSoulPath(), 'utf-8');
    } catch {
      // No SOUL.md
    }

    // Try to match current SOUL.md against templates
    let activeTemplate: string | null = null;
    if (setup?.personality?.getActiveTemplate) {
      const t = await setup.personality.getActiveTemplate();
      activeTemplate = t?.id ?? null;
    }

    res.json({
      data: {
        name: agent.name ?? 'Auxiora',
        pronouns: agent.pronouns ?? 'they/them',
        avatar: agent.avatar ?? null,
        vibe: agent.vibe ?? '',
        tone: agent.tone ?? { warmth: 0.6, directness: 0.5, humor: 0.3, formality: 0.5 },
        errorStyle: agent.errorStyle ?? 'professional',
        expertise: agent.expertise ?? [],
        catchphrases: agent.catchphrases ?? {},
        boundaries: agent.boundaries ?? { neverJokeAbout: [], neverAdviseOn: [] },
        customInstructions: agent.customInstructions ?? '',
        soulContent,
        activeTemplate,
      },
    });
  });
```

Note: `deps` is the parameter name used in the `createDashboardRouter(deps)` function. `fs` is already imported at the top of the file. `getSoulPath` is imported from `@auxiora/core`.

**Step 2: Add PUT /personality/full endpoint**

After the GET endpoint, add:

```typescript
  router.put('/personality/full', async (req: Request, res: Response) => {
    if (!setup?.saveConfig) {
      res.status(503).json({ error: 'Setup not available' });
      return;
    }
    const body = req.body as Record<string, unknown>;

    // Build the agent config update
    const agentUpdate: Record<string, unknown> = {};
    if (typeof body.name === 'string') agentUpdate.name = body.name;
    if (typeof body.pronouns === 'string') agentUpdate.pronouns = body.pronouns;
    if (typeof body.avatar === 'string' || body.avatar === null) agentUpdate.avatar = body.avatar ?? undefined;
    if (typeof body.vibe === 'string') agentUpdate.vibe = body.vibe;
    if (typeof body.customInstructions === 'string') agentUpdate.customInstructions = body.customInstructions;
    if (typeof body.errorStyle === 'string') agentUpdate.errorStyle = body.errorStyle;
    if (body.tone && typeof body.tone === 'object') agentUpdate.tone = body.tone;
    if (Array.isArray(body.expertise)) agentUpdate.expertise = body.expertise;
    if (body.catchphrases && typeof body.catchphrases === 'object') agentUpdate.catchphrases = body.catchphrases;
    if (body.boundaries && typeof body.boundaries === 'object') agentUpdate.boundaries = body.boundaries;

    try {
      await setup.saveConfig({ agent: agentUpdate });

      // If soulContent is provided, write SOUL.md
      if (typeof body.soulContent === 'string') {
        const soulPath = getSoulPath();
        await fs.mkdir(path.dirname(soulPath), { recursive: true });
        await fs.writeFile(soulPath, body.soulContent, 'utf-8');
      }

      // If a template was selected, apply it (this overwrites SOUL.md)
      if (typeof body.template === 'string' && body.template && setup.personality) {
        await setup.personality.applyTemplate(body.template);
      }

      void audit('settings.personality.full', { fields: Object.keys(agentUpdate) });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });
```

Note: `path` is already imported at the top of the file. `audit` is the existing audit function.

**Step 3: Add API client methods**

In `packages/dashboard/ui/src/api.ts`, add these methods to the `api` object:

```typescript
  getPersonalityFull: () =>
    fetchApi<{ data: {
      name: string; pronouns: string; avatar: string | null; vibe: string;
      tone: { warmth: number; directness: number; humor: number; formality: number };
      errorStyle: string; expertise: string[]; catchphrases: Record<string, string>;
      boundaries: { neverJokeAbout: string[]; neverAdviseOn: string[] };
      customInstructions: string; soulContent: string | null; activeTemplate: string | null;
    } }>('/personality/full'),

  updatePersonalityFull: (data: Record<string, unknown>) =>
    fetchApi<{ success: boolean }>('/personality/full', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/dashboard/tsconfig.json`
Expected: Clean compile.

**Step 5: Commit**

```bash
git add packages/dashboard/src/router.ts packages/dashboard/ui/src/api.ts
git commit -m "feat(dashboard): add full personality GET/PUT API endpoints"
```

---

### Task 4: Build the unified PersonalityEditor page

**Files:**
- Create: `packages/dashboard/ui/src/pages/settings/PersonalityEditor.tsx`
- Modify: `packages/dashboard/ui/src/App.tsx` (update routes)
- Modify: `packages/dashboard/ui/src/components/Layout.tsx` (update nav)

**Step 1: Create PersonalityEditor.tsx**

Create `packages/dashboard/ui/src/pages/settings/PersonalityEditor.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { useApi } from '../../hooks/useApi';

interface ToneSettings {
  warmth: number;
  directness: number;
  humor: number;
  formality: number;
}

interface PersonalityState {
  name: string;
  pronouns: string;
  avatar: string | null;
  vibe: string;
  tone: ToneSettings;
  errorStyle: string;
  expertise: string[];
  catchphrases: Record<string, string>;
  boundaries: { neverJokeAbout: string[]; neverAdviseOn: string[] };
  customInstructions: string;
  soulContent: string | null;
  activeTemplate: string | null;
}

const TONE_LABELS: Record<keyof ToneSettings, [string, string]> = {
  warmth: ['Reserved', 'Warm'],
  directness: ['Gentle', 'Direct'],
  humor: ['Serious', 'Playful'],
  formality: ['Casual', 'Formal'],
};

const ERROR_STYLES = [
  'professional', 'apologetic', 'matter_of_fact', 'self_deprecating',
  'gentle', 'detailed', 'encouraging', 'terse', 'educational',
];

const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'it/its'];

function TagInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (!value.includes(input.trim())) {
        onChange([...value, input.trim()]);
      }
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="tag-input-container">
      <div className="tag-list">
        {value.map((tag, i) => (
          <span key={i} className="tag">
            {tag}
            <button type="button" className="tag-remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>x</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="tag-input"
      />
    </div>
  );
}

function ToneSlider({ label, value, onChange, extremes }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  extremes: [string, string];
}) {
  return (
    <div className="tone-slider">
      <div className="tone-slider-header">
        <span className="tone-label">{label}</span>
        <span className="tone-value">{Math.round(value * 100)}%</span>
      </div>
      <div className="tone-slider-row">
        <span className="tone-extreme">{extremes[0]}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(value * 100)}
          onChange={(e) => onChange(parseInt(e.target.value) / 100)}
          className="slider"
        />
        <span className="tone-extreme">{extremes[1]}</span>
      </div>
    </div>
  );
}

export function PersonalityEditor() {
  const { data: templates } = useApi(() => api.getTemplates(), []);
  const [state, setState] = useState<PersonalityState | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.getPersonalityFull()
      .then(res => setState(res.data))
      .catch(err => setError(err.message));
  }, []);

  const update = useCallback(<K extends keyof PersonalityState>(key: K, value: PersonalityState[K]) => {
    setState(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(true);
    setSuccess('');
  }, []);

  const updateTone = useCallback((key: keyof ToneSettings, value: number) => {
    setState(prev => prev ? { ...prev, tone: { ...prev.tone, [key]: value } } : prev);
    setDirty(true);
    setSuccess('');
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const t = (templates?.data ?? []).find((t: any) => t.id === templateId);
    if (!t) return;
    // Template selection — will be applied server-side
    update('activeTemplate', templateId);
  }, [templates, update]);

  const handleSave = async () => {
    if (!state) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updatePersonalityFull({
        name: state.name,
        pronouns: state.pronouns,
        avatar: state.avatar,
        vibe: state.vibe,
        tone: state.tone,
        errorStyle: state.errorStyle,
        expertise: state.expertise,
        catchphrases: state.catchphrases,
        boundaries: state.boundaries,
        customInstructions: state.customInstructions,
        soulContent: state.soulContent,
        template: state.activeTemplate,
      });
      setSuccess('Personality saved. Changes take effect on next message.');
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!state) {
    return <div className="page"><h2>Personality</h2><p>Loading...</p></div>;
  }

  return (
    <div className="page personality-editor">
      <div className="page-header">
        <h2>Personality</h2>
        {dirty && (
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>
      {success && <div className="settings-success">{success}</div>}
      {error && <div className="error">{error}</div>}

      {/* SECTION 1: Identity */}
      <section className="editor-section">
        <h3>Identity</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Name</label>
            <input type="text" value={state.name} onChange={e => update('name', e.target.value)} placeholder="Auxiora" />
          </div>
          <div className="form-field">
            <label>Pronouns</label>
            <select value={state.pronouns} onChange={e => update('pronouns', e.target.value)}>
              {PRONOUN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              {!PRONOUN_OPTIONS.includes(state.pronouns) && <option value={state.pronouns}>{state.pronouns}</option>}
            </select>
          </div>
          <div className="form-field full-width">
            <label>Vibe</label>
            <input
              type="text"
              value={state.vibe}
              onChange={e => update('vibe', e.target.value)}
              placeholder="warm, witty, slightly sarcastic"
              maxLength={200}
            />
            <span className="field-hint">{state.vibe.length}/200 - Short personality summary</span>
          </div>
          <div className="form-field full-width">
            <label>Avatar URL</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {state.avatar && (
                <img
                  src={state.avatar}
                  alt="Avatar"
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <input
                type="text"
                value={state.avatar ?? ''}
                onChange={e => update('avatar', e.target.value || null)}
                placeholder="https://example.com/avatar.png"
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Tone */}
      <section className="editor-section">
        <h3>Tone</h3>
        <div className="tone-sliders">
          {(Object.keys(TONE_LABELS) as (keyof ToneSettings)[]).map(key => (
            <ToneSlider
              key={key}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              value={state.tone[key]}
              onChange={v => updateTone(key, v)}
              extremes={TONE_LABELS[key]}
            />
          ))}
        </div>
      </section>

      {/* SECTION 3: Templates */}
      <section className="editor-section">
        <h3>Quick Start Templates</h3>
        <p className="field-hint">Select a template to populate fields above. You can customize after.</p>
        <div className="template-grid">
          {(templates?.data ?? []).map((t: any) => (
            <div
              key={t.id}
              className={`template-card${state.activeTemplate === t.id ? ' selected' : ''}`}
              onClick={() => applyTemplate(t.id)}
            >
              <h4>{t.name}</h4>
              <p>{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: Behavior */}
      <section className="editor-section">
        <h3>Behavior</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Error Style</label>
            <select value={state.errorStyle} onChange={e => update('errorStyle', e.target.value)}>
              {ERROR_STYLES.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="form-field full-width">
            <label>Expertise Areas</label>
            <TagInput
              value={state.expertise}
              onChange={v => update('expertise', v)}
              placeholder="Type and press Enter..."
            />
          </div>
          <div className="form-field full-width">
            <label>Catchphrases</label>
            <div className="catchphrase-grid">
              {['greeting', 'farewell', 'thinking', 'success', 'error'].map(key => (
                <div key={key} className="catchphrase-row">
                  <label className="catchphrase-label">{key}</label>
                  <input
                    type="text"
                    value={state.catchphrases[key] ?? ''}
                    onChange={e => update('catchphrases', { ...state.catchphrases, [key]: e.target.value })}
                    placeholder={`${key} phrase...`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>Never joke about</label>
            <TagInput
              value={state.boundaries.neverJokeAbout}
              onChange={v => update('boundaries', { ...state.boundaries, neverJokeAbout: v })}
              placeholder="Topics..."
            />
          </div>
          <div className="form-field">
            <label>Never advise on</label>
            <TagInput
              value={state.boundaries.neverAdviseOn}
              onChange={v => update('boundaries', { ...state.boundaries, neverAdviseOn: v })}
              placeholder="Topics..."
            />
          </div>
        </div>
      </section>

      {/* SECTION 5: Custom Instructions */}
      <section className="editor-section">
        <h3>Custom Instructions</h3>
        <p className="field-hint">Additional instructions injected into the system prompt. Use for personality quirks, communication rules, or domain-specific guidance.</p>
        <textarea
          value={state.customInstructions}
          onChange={e => update('customInstructions', e.target.value)}
          placeholder="e.g. Always end responses with a relevant emoji. Use British spelling."
          rows={6}
          maxLength={4000}
          className="custom-instructions-textarea"
        />
        <span className="field-hint">{state.customInstructions.length}/4000</span>
      </section>

      {/* SECTION 6: Advanced - SOUL.md */}
      <section className="editor-section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '- ' : '+ '}Advanced: Raw SOUL.md
        </button>
        {showAdvanced && (
          <>
            <p className="field-hint" style={{ marginTop: '0.5rem' }}>
              Direct SOUL.md editor. Warning: Manual edits here may be overwritten if you select a template above.
            </p>
            <textarea
              value={state.soulContent ?? ''}
              onChange={e => update('soulContent', e.target.value)}
              rows={12}
              className="soul-editor-textarea"
              spellCheck={false}
            />
          </>
        )}
      </section>

      {/* Save button at bottom too */}
      {dirty && (
        <div className="editor-footer">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd packages/dashboard/ui && npx tsc --noEmit`

If tsc is not configured for the UI (Vite projects often skip it), try:
Run: `cd packages/dashboard/ui && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/pages/settings/PersonalityEditor.tsx
git commit -m "feat(dashboard): create unified PersonalityEditor settings page"
```

---

### Task 5: Add CSS styles for the personality editor

**Files:**
- Modify: `packages/dashboard/ui/src/styles/global.css`

**Step 1: Add personality editor styles**

Append to `packages/dashboard/ui/src/styles/global.css`:

```css
/* Personality Editor */
.personality-editor .page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.editor-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.editor-section h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: var(--text-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.field-hint {
  font-size: 0.7rem;
  color: var(--text-tertiary, var(--text-secondary));
  margin-top: 0.15rem;
}

/* Tone sliders */
.tone-sliders {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tone-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.tone-label {
  font-size: 0.85rem;
  color: var(--text-primary);
  font-weight: 500;
}

.tone-value {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.tone-slider-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tone-extreme {
  font-size: 0.7rem;
  color: var(--text-secondary);
  min-width: 4rem;
}

.tone-extreme:last-child {
  text-align: right;
}

.slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border);
  border-radius: 3px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--surface);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

/* Tag input */
.tag-input-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  min-height: 38px;
  align-items: center;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  background: var(--accent);
  color: var(--text-on-accent, #fff);
  border-radius: 4px;
  font-size: 0.75rem;
}

.tag-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0 0.15rem;
  font-size: 0.7rem;
  opacity: 0.7;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-input {
  border: none;
  background: transparent;
  outline: none;
  flex: 1;
  min-width: 80px;
  font-size: 0.85rem;
  color: var(--text-primary);
}

/* Catchphrase grid */
.catchphrase-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.catchphrase-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.catchphrase-label {
  min-width: 5rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.catchphrase-row input {
  flex: 1;
}

/* Custom instructions */
.custom-instructions-textarea,
.soul-editor-textarea {
  width: 100%;
  resize: vertical;
  font-family: inherit;
  font-size: 0.85rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
}

.soul-editor-textarea {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 0.8rem;
}

/* Section toggle */
.section-toggle {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
}

.section-toggle:hover {
  color: var(--text-primary);
}

/* Editor footer */
.editor-footer {
  position: sticky;
  bottom: 0;
  padding: 1rem 0;
  background: var(--bg);
  border-top: 1px solid var(--border);
  text-align: right;
}

/* Template grid (shared) */
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}

.template-card {
  padding: 1rem;
  border: 2px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.template-card:hover {
  border-color: var(--accent);
}

.template-card.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.template-card h4 {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
}

.template-card p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
```

**Step 2: Build to verify no CSS errors**

Run: `cd packages/dashboard/ui && pnpm build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add packages/dashboard/ui/src/styles/global.css
git commit -m "style(dashboard): add personality editor CSS"
```

---

### Task 6: Wire up routes and navigation

**Files:**
- Modify: `packages/dashboard/ui/src/App.tsx`
- Modify: `packages/dashboard/ui/src/components/Layout.tsx`

**Step 1: Update App.tsx routes**

In `packages/dashboard/ui/src/App.tsx`:

1. Add import at top:
```typescript
import { PersonalityEditor } from './pages/settings/PersonalityEditor';
```

2. Replace the two separate routes:
```tsx
        <Route path="settings/identity" element={<SettingsIdentity />} />
        <Route path="settings/personality" element={<SettingsPersonality />} />
```
with a single unified route:
```tsx
        <Route path="settings/personality" element={<PersonalityEditor />} />
```

3. Add a redirect for the old identity path (so bookmarks don't break):
```tsx
        <Route path="settings/identity" element={<Navigate to="/settings/personality" replace />} />
```

4. Remove unused imports: `SettingsIdentity` and `SettingsPersonality` (lines 10-11).

**Step 2: Update Layout.tsx navigation**

In `packages/dashboard/ui/src/components/Layout.tsx`, find the Settings nav group (line ~101). Replace the Identity and Personality links:

```tsx
            <li>
              <NavLink to="/settings/identity" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Identity
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings/personality" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Personality
              </NavLink>
            </li>
```

with a single link:

```tsx
            <li>
              <NavLink to="/settings/personality" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Personality
              </NavLink>
            </li>
```

**Step 3: Build the full dashboard**

Run: `cd packages/dashboard/ui && pnpm build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/dashboard/ui/src/App.tsx packages/dashboard/ui/src/components/Layout.tsx
git commit -m "feat(dashboard): wire unified personality editor into routes and navigation"
```

---

### Task 7: Build, restart, and manual test

**Step 1: Full project build**

Run: `pnpm build`
Expected: All packages build cleanly.

**Step 2: Restart the app**

```bash
lsof -ti:18800 | xargs kill -9 2>/dev/null
sleep 1
node packages/cli/dist/index.js start --no-vault &
```

**Step 3: Manual test checklist**

Open `http://localhost:18800/dashboard/settings/personality` and verify:

- [ ] Page loads with current personality data
- [ ] Name and pronouns fields are populated
- [ ] Vibe text input works (typing updates, 200 char max shown)
- [ ] Avatar URL input shows preview when valid URL entered
- [ ] Tone sliders move and show percentage
- [ ] Template cards appear and highlight on click
- [ ] Error style dropdown has all options
- [ ] Expertise tag input: type + Enter adds, backspace removes
- [ ] Catchphrase inputs work for all 5 keys
- [ ] Boundary tag inputs work
- [ ] Custom instructions textarea works with character count
- [ ] Advanced SOUL.md section toggles open/closed
- [ ] Save button appears when changes made
- [ ] Save button persists changes (reload page to verify)
- [ ] Old `/settings/identity` URL redirects to `/settings/personality`
- [ ] Sidebar shows single "Personality" link (no more "Identity")

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(dashboard): personality editor polish"
```
