import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PromptAssembler } from '../prompt-assembler.js';
import { ModeLoader } from '../mode-loader.js';
import type { AgentIdentity } from '@auxiora/config';
import type { SessionModeState, UserPreferences } from '../types.js';
import { DEFAULT_PREFERENCES } from '../types.js';
import { SecurityFloor } from '../../security-floor.js';
import type { EscalationState } from '../../escalation.js';

// Mock @auxiora/core path getters to use temp dirs
let workspaceDir: string;
vi.mock('@auxiora/core', () => ({
  getSoulPath: () => path.join(workspaceDir, 'SOUL.md'),
  getAgentsPath: () => path.join(workspaceDir, 'AGENTS.md'),
  getIdentityPath: () => path.join(workspaceDir, 'IDENTITY.md'),
  getUserPath: () => path.join(workspaceDir, 'USER.md'),
}));

const defaultAgent: AgentIdentity = {
  name: 'TestBot',
  pronouns: 'they/them',
  personality: 'professional',
  tone: { warmth: 0.6, directness: 0.5, humor: 0.3, formality: 0.5 },
  expertise: [],
  errorStyle: 'professional',
  catchphrases: {},
  boundaries: { neverJokeAbout: [], neverAdviseOn: [] },
};

describe('PromptAssembler', () => {
  let tmpDir: string;
  let modesDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-assembler-test-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    modesDir = path.join(tmpDir, 'modes');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(modesDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createAssembler(modeFiles?: Record<string, string>) {
    if (modeFiles) {
      for (const [name, content] of Object.entries(modeFiles)) {
        await fs.writeFile(path.join(modesDir, name), content);
      }
    }
    const loader = new ModeLoader(modesDir, path.join(tmpDir, 'user-modes'));
    await loader.loadAll();
    return new PromptAssembler(defaultAgent, loader);
  }

  it('should build base prompt with identity preamble when SOUL.md exists', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul');
    const assembler = await createAssembler();
    const base = await assembler.buildBase();
    expect(base).toContain('# Agent Identity');
    expect(base).toContain('TestBot');
    expect(base).toContain('they/them');
  });

  it('should include SOUL.md when present', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# My Soul\nI am helpful.');
    const assembler = await createAssembler();
    const base = await assembler.buildBase();
    expect(base).toContain('# My Soul');
    expect(base).toContain('I am helpful.');
  });

  it('should handle missing optional files gracefully', async () => {
    // No SOUL.md, AGENTS.md, IDENTITY.md, or USER.md
    const assembler = await createAssembler();
    const base = await assembler.buildBase();
    // Should fall through to default prompt
    expect(base).toContain('TestBot');
    expect(base).toContain('helpful AI assistant');
  });

  it('should include all context files when present', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul content');
    await fs.writeFile(path.join(workspaceDir, 'AGENTS.md'), '# Agent definitions');
    await fs.writeFile(path.join(workspaceDir, 'IDENTITY.md'), '# Custom identity');
    await fs.writeFile(path.join(workspaceDir, 'USER.md'), 'User profile info');

    const assembler = await createAssembler();
    const base = await assembler.buildBase();

    expect(base).toContain('# Soul content');
    expect(base).toContain('# Agent definitions');
    expect(base).toContain('# Custom identity');
    expect(base).toContain('About the User');
    expect(base).toContain('User profile info');
  });

  it('should inject mode instructions when mode is active', async () => {
    const assembler = await createAssembler({
      'operator.md': `<!-- mode: operator\n name: Operator\n description: Fast exec\n signals: run:0.8 -->\nBe fast and direct.`,
    });
    await assembler.buildBase();

    const state: SessionModeState = { activeMode: 'operator', autoDetected: false };
    const enriched = assembler.enrichForMessage(state, null);

    expect(enriched).toContain('Active Mode: Operator');
    expect(enriched).toContain('Be fast and direct.');
  });

  it('should not inject mode when mode is "auto"', async () => {
    const assembler = await createAssembler({
      'operator.md': `<!-- mode: operator\n name: Operator\n description: test\n signals: run:0.8 -->\nOperator content`,
    });
    await assembler.buildBase();

    const state: SessionModeState = { activeMode: 'auto', autoDetected: false };
    const enriched = assembler.enrichForMessage(state, null);

    expect(enriched).not.toContain('Active Mode');
  });

  it('should not inject mode when mode is "off"', async () => {
    const assembler = await createAssembler({
      'operator.md': `<!-- mode: operator\n name: Operator\n description: test\n signals: run:0.8 -->\nOperator content`,
    });
    await assembler.buildBase();

    const state: SessionModeState = { activeMode: 'off', autoDetected: false };
    const enriched = assembler.enrichForMessage(state, null);

    expect(enriched).not.toContain('Active Mode');
  });

  it('should append memory section to enriched prompt', async () => {
    const assembler = await createAssembler();
    await assembler.buildBase();

    const state: SessionModeState = { activeMode: 'auto', autoDetected: false };
    const enriched = assembler.enrichForMessage(state, '\n\n## Memories\nUser likes TypeScript.');

    expect(enriched).toContain('## Memories');
    expect(enriched).toContain('User likes TypeScript.');
  });

  it('should render extreme preference values', async () => {
    const assembler = await createAssembler();
    const extreme: UserPreferences = {
      verbosity: 0.0,
      formality: 1.0,
      proactiveness: 0.0,
      riskTolerance: 1.0,
      humor: 0.0,
      feedbackStyle: 'sandwich',
      expertiseAssumption: 'expert',
    };

    const rendered = assembler.renderPreferences(extreme);
    expect(rendered).toContain('concise');
    expect(rendered).toContain('formal');
    expect(rendered).toContain('Only answer what is directly asked');
    expect(rendered).toContain('bold');
    expect(rendered).toContain('serious');
    expect(rendered).toContain('sandwich');
    expect(rendered).toContain('deep technical knowledge');
  });

  it('should not render preferences at default values', async () => {
    const assembler = await createAssembler();
    const rendered = assembler.renderPreferences(DEFAULT_PREFERENCES);
    // At 0.5 values, no extreme language should appear
    expect(rendered).not.toContain('concise');
    expect(rendered).not.toContain('thorough');
    expect(rendered).not.toContain('casual');
    expect(rendered).not.toContain('formal');
  });

  it('should produce backward-compatible prompt when no modes active', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul');
    const assembler = await createAssembler();
    const base = await assembler.buildBase();

    // With no mode state, enrichment should just be base + memory
    const enriched = assembler.enrichForMessage(undefined, '\n\nmemory');
    expect(enriched).toBe(base + '\n\nmemory');
  });

  // --- Security context and escalation tests ---

  it('should produce security floor section without mode instructions', async () => {
    const assembler = await createAssembler({
      'operator.md': `<!-- mode: operator\n name: Operator\n description: test\n signals: run:0.8 -->\nOperator content`,
    });
    await assembler.buildBase();

    const sf = new SecurityFloor();
    const ctx = sf.detectSecurityContext({ userMessage: 'rotate my API key' });
    const enriched = assembler.enrichForSecurityContext(ctx, sf, null);

    expect(enriched).toContain('Security Floor Active');
    expect(enriched).not.toContain('Active Mode');
    expect(enriched).not.toContain('User Preferences');
  });

  it('should include memories in security context prompt', async () => {
    const assembler = await createAssembler();
    await assembler.buildBase();

    const sf = new SecurityFloor();
    const ctx = sf.detectSecurityContext({ userMessage: 'revoke access' });
    const enriched = assembler.enrichForSecurityContext(ctx, sf, '\n\n## Memories\nUser prefers verbose.');

    expect(enriched).toContain('Security Floor Active');
    expect(enriched).toContain('## Memories');
    expect(enriched).toContain('User prefers verbose.');
  });

  it('should dampen tone for caution escalation', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul');
    const assembler = await createAssembler();
    await assembler.buildBase();

    const escalation: EscalationState = { level: 'caution', lastEvent: 'uncertainty' };
    const enriched = assembler.enrichForMessage(undefined, null, undefined, escalation);

    // Humor should be halved: 0.3 * 0.5 = 0.15
    expect(enriched).toContain('Humor: 0.15/1.0');
  });

  it('should zero humor for serious escalation', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul');
    const assembler = await createAssembler();
    await assembler.buildBase();

    const escalation: EscalationState = { level: 'serious', lastEvent: 'access_failure' };
    const enriched = assembler.enrichForMessage(undefined, null, undefined, escalation);

    expect(enriched).toContain('Humor: 0/1.0');
    expect(enriched).toContain('Directness: 0.6/1.0'); // raised from 0.5
  });

  it('should not dampen tone without escalation param (backward compat)', async () => {
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), '# Soul');
    const assembler = await createAssembler();
    const base = await assembler.buildBase();

    // Without escalation, enrichment should use original base
    const enriched = assembler.enrichForMessage(undefined, null);
    expect(enriched).toBe(base);
  });
});
