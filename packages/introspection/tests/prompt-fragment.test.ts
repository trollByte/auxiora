import { describe, expect, it } from 'vitest';
import { generatePromptFragment } from '../src/prompt-fragment.js';
import type { CapabilityCatalog, HealthState } from '../src/types.js';

const catalog: CapabilityCatalog = {
  tools: [
    { name: 'bash', description: 'Run commands', parameterCount: 1 },
    { name: 'web_browser', description: 'Browse', parameterCount: 1 },
    { name: 'research', description: 'Research topics', parameterCount: 2 },
  ],
  channels: [
    { type: 'discord', connected: true, hasDefault: true },
    { type: 'telegram', connected: false, hasDefault: false },
    { type: 'webchat', connected: true, hasDefault: true },
  ],
  behaviors: [
    { id: 'b1', type: 'scheduled', status: 'active', action: 'Daily report', runCount: 10, failCount: 0, maxFailures: 3, health: 'healthy' },
    { id: 'b2', type: 'monitor', status: 'paused', action: 'Watch', runCount: 5, failCount: 3, maxFailures: 3, health: 'paused' },
  ],
  providers: [
    { name: 'anthropic', displayName: 'Anthropic', available: true, isPrimary: true, isFallback: false, models: ['claude-sonnet'] },
    { name: 'openai', displayName: 'OpenAI', available: true, isPrimary: false, isFallback: true, models: ['gpt-4'] },
  ],
  plugins: [{ name: 'weather', version: '1.0.0', status: 'loaded', toolCount: 2, behaviorCount: 0 }],
  features: { behaviors: true, browser: true, voice: false },
  updatedAt: '2026-02-15T12:00:00Z',
};

const healthyState: HealthState = { overall: 'healthy', subsystems: [], issues: [], lastCheck: '2026-02-15T12:00:00Z' };
const degradedState: HealthState = {
  overall: 'degraded',
  subsystems: [],
  lastCheck: '2026-02-15T12:00:00Z',
  issues: [{ id: 'i1', subsystem: 'channels', severity: 'warning', description: 'Telegram disconnected', detectedAt: '2026-02-15T11:55:00Z', autoFixable: true, trustLevelRequired: 2 }],
};

describe('generatePromptFragment', () => {
  it('includes tool names', () => {
    const result = generatePromptFragment(catalog, healthyState);
    expect(result).toContain('bash');
    expect(result).toContain('web_browser');
    expect(result).toContain('research');
  });

  it('shows channel connectivity', () => {
    const result = generatePromptFragment(catalog, healthyState);
    expect(result).toContain('discord');
    expect(result).toContain('connected');
  });

  it('shows behavior summary', () => {
    const result = generatePromptFragment(catalog, healthyState);
    expect(result).toContain('1 active');
    expect(result).toContain('1 paused');
  });

  it('shows provider info', () => {
    const result = generatePromptFragment(catalog, healthyState);
    expect(result).toContain('Anthropic');
    expect(result).toContain('primary');
  });

  it('shows healthy status', () => {
    const result = generatePromptFragment(catalog, healthyState);
    expect(result.toLowerCase()).toContain('all systems operational');
  });

  it('shows issues when degraded', () => {
    const result = generatePromptFragment(catalog, degradedState);
    expect(result).toContain('Telegram disconnected');
  });
});
