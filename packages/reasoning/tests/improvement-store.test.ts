import { describe, it, expect, afterEach } from 'vitest';
import { ImprovementStore } from '../src/improvement-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ImprovementProposal } from '../src/improvement-types.js';

describe('ImprovementStore', () => {
  let store: ImprovementStore;
  let tmpDir: string;

  afterEach(() => {
    store?.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and retrieves proposals', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    const proposal: ImprovementProposal = {
      observations: { accuracy: 0.85 },
      reflections: { patterns: ['error on long inputs'] },
      hypotheses: { proposals: [{ change: 'chunk inputs' }] },
      validations: { testResults: [{ passed: true }] },
      status: 'pending_review',
      createdAt: Date.now(),
    };

    const id = store.record(proposal);
    expect(id).toBeGreaterThan(0);

    const retrieved = store.getById(id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.status).toBe('pending_review');
    expect(retrieved!.observations).toEqual({ accuracy: 0.85 });
  });

  it('updates proposal status', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    const id = store.record({
      observations: {},
      reflections: {},
      hypotheses: {},
      validations: {},
      status: 'pending_review',
      createdAt: Date.now(),
    });

    store.updateStatus(id, 'approved');
    expect(store.getById(id)!.status).toBe('approved');

    store.updateStatus(id, 'applied');
    expect(store.getById(id)!.status).toBe('applied');
  });

  it('lists proposals by status', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: 1000 });
    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'approved', createdAt: 2000 });
    store.record({ observations: {}, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: 3000 });

    const pending = store.getByStatus('pending_review');
    expect(pending).toHaveLength(2);

    const approved = store.getByStatus('approved');
    expect(approved).toHaveLength(1);
  });

  it('returns recent proposals', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'imp-'));
    store = new ImprovementStore(join(tmpDir, 'improvements.db'));

    for (let i = 0; i < 5; i++) {
      store.record({ observations: { i }, reflections: {}, hypotheses: {}, validations: {}, status: 'pending_review', createdAt: i * 1000 });
    }

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect((recent[0].observations as Record<string, number>).i).toBe(4);
  });
});
