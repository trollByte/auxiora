import { afterEach, describe, expect, it } from 'vitest';
import { ArchiveStore } from '../src/archive-store.js';
import type { Niche, Variant } from '../src/types.js';

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'v-1',
    generation: 1,
    parentIds: [],
    strategy: 'create_new',
    type: 'prompt',
    content: 'test prompt content',
    metadata: { tag: 'test' },
    metrics: { accuracy: 0.9, latencyP50: 100, latencyP95: 200, errorRate: 0.01 },
    securityPassed: true,
    reviewScore: 0.85,
    status: 'evaluated',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ArchiveStore', () => {
  let store: ArchiveStore;

  afterEach(() => {
    store?.close();
  });

  it('stores and retrieves a variant', () => {
    store = new ArchiveStore(':memory:');
    const v = makeVariant();
    store.saveVariant(v);
    const got = store.getVariant('v-1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('v-1');
    expect(got!.parentIds).toEqual([]);
    expect(got!.metrics.accuracy).toBe(0.9);
    expect(got!.securityPassed).toBe(true);
    expect(got!.metadata).toEqual({ tag: 'test' });
  });

  it('returns null for nonexistent variant', () => {
    store = new ArchiveStore(':memory:');
    expect(store.getVariant('nope')).toBeNull();
  });

  it('updates variant status', () => {
    store = new ArchiveStore(':memory:');
    store.saveVariant(makeVariant());
    store.updateVariantStatus('v-1', 'deployed');
    const got = store.getVariant('v-1');
    expect(got!.status).toBe('deployed');
  });

  it('sets and gets archive cell', () => {
    store = new ArchiveStore(':memory:');
    const niche: Niche = { domain: 'math', complexity: 'simple' };
    store.setCell(niche, 'v-1', 0.92);
    const cell = store.getCell(niche);
    expect(cell).not.toBeNull();
    expect(cell!.variantId).toBe('v-1');
    expect(cell!.benchmarkScore).toBe(0.92);
    expect(cell!.staleness).toBe(0);
    expect(cell!.niche).toEqual(niche);
  });

  it('returns null for empty cell', () => {
    store = new ArchiveStore(':memory:');
    expect(store.getCell({ domain: 'x', complexity: 'complex' })).toBeNull();
  });

  it('replaces cell when new variant set', () => {
    store = new ArchiveStore(':memory:');
    const niche: Niche = { domain: 'math', complexity: 'moderate' };
    store.setCell(niche, 'v-1', 0.80);
    store.setCell(niche, 'v-2', 0.95);
    const cell = store.getCell(niche);
    expect(cell!.variantId).toBe('v-2');
    expect(cell!.benchmarkScore).toBe(0.95);
    expect(cell!.staleness).toBe(0);
  });

  it('lists all occupied cells', () => {
    store = new ArchiveStore(':memory:');
    store.setCell({ domain: 'math', complexity: 'simple' }, 'v-1', 0.9);
    store.setCell({ domain: 'code', complexity: 'complex' }, 'v-2', 0.8);
    const cells = store.getAllCells();
    expect(cells).toHaveLength(2);
  });

  it('increments staleness for all cells', () => {
    store = new ArchiveStore(':memory:');
    store.setCell({ domain: 'math', complexity: 'simple' }, 'v-1', 0.9);
    store.setCell({ domain: 'code', complexity: 'complex' }, 'v-2', 0.8);
    store.incrementStaleness();
    store.incrementStaleness();
    const cells = store.getAllCells();
    for (const c of cells) {
      expect(c.staleness).toBe(2);
    }
  });

  it('resets staleness when cell is updated', () => {
    store = new ArchiveStore(':memory:');
    const niche: Niche = { domain: 'math', complexity: 'simple' };
    store.setCell(niche, 'v-1', 0.9);
    store.incrementStaleness();
    store.incrementStaleness();
    store.incrementStaleness();
    expect(store.getCell(niche)!.staleness).toBe(3);
    store.setCell(niche, 'v-2', 0.95);
    expect(store.getCell(niche)!.staleness).toBe(0);
  });

  it('gets stale cells above threshold', () => {
    store = new ArchiveStore(':memory:');
    store.setCell({ domain: 'math', complexity: 'simple' }, 'v-1', 0.9);
    store.setCell({ domain: 'code', complexity: 'complex' }, 'v-2', 0.8);
    store.incrementStaleness();
    store.incrementStaleness();
    store.incrementStaleness();
    // Reset one cell
    store.setCell({ domain: 'math', complexity: 'simple' }, 'v-3', 0.95);
    const stale = store.getStaleCells(2);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.niche.domain).toBe('code');
  });

  it('gets variants by status', () => {
    store = new ArchiveStore(':memory:');
    store.saveVariant(makeVariant({ id: 'v-1', status: 'evaluated' }));
    store.saveVariant(makeVariant({ id: 'v-2', status: 'deployed' }));
    store.saveVariant(makeVariant({ id: 'v-3', status: 'evaluated' }));
    const evaluated = store.getVariantsByStatus('evaluated');
    expect(evaluated).toHaveLength(2);
    expect(evaluated.map((v) => v.id).sort()).toEqual(['v-1', 'v-3']);
  });

  it('counts variants created today', () => {
    store = new ArchiveStore(':memory:');
    store.saveVariant(makeVariant({ id: 'v-today', createdAt: Date.now() }));
    // One from yesterday
    store.saveVariant(makeVariant({ id: 'v-old', createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    expect(store.getVariantsCreatedToday()).toBe(1);
  });

  it('gets variants by parent (lineage)', () => {
    store = new ArchiveStore(':memory:');
    store.saveVariant(makeVariant({ id: 'child-1', parentIds: ['parent-a', 'parent-b'] }));
    store.saveVariant(makeVariant({ id: 'child-2', parentIds: ['parent-a'] }));
    store.saveVariant(makeVariant({ id: 'child-3', parentIds: ['parent-c'] }));
    const children = store.getVariantsByParent('parent-a');
    expect(children).toHaveLength(2);
    expect(children.map((v) => v.id).sort()).toEqual(['child-1', 'child-2']);
  });

  it('lists known domains', () => {
    store = new ArchiveStore(':memory:');
    store.setCell({ domain: 'math', complexity: 'simple' }, 'v-1', 0.9);
    store.setCell({ domain: 'code', complexity: 'complex' }, 'v-2', 0.8);
    store.setCell({ domain: 'math', complexity: 'complex' }, 'v-3', 0.7);
    const domains = store.getDomains();
    expect(domains).toEqual(['code', 'math']);
  });

  it('prunes old failed variants', () => {
    store = new ArchiveStore(':memory:');
    const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
    store.saveVariant(makeVariant({ id: 'old-fail', status: 'failed', createdAt: oldTime }));
    store.saveVariant(makeVariant({ id: 'recent-fail', status: 'failed', createdAt: Date.now() }));
    store.saveVariant(makeVariant({ id: 'old-ok', status: 'evaluated', createdAt: oldTime }));
    const pruned = store.pruneOldFailed(30);
    expect(pruned).toBe(1);
    expect(store.getVariant('old-fail')).toBeNull();
    expect(store.getVariant('recent-fail')).not.toBeNull();
    expect(store.getVariant('old-ok')).not.toBeNull();
  });
});
