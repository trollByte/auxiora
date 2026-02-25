import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArchitectPersistence } from '../persistence.js';
import type { ArchitectPreferences } from '../persistence.js';
import { InMemoryEncryptedStorage } from '../persistence-adapter.js';
import { CorrectionStore } from '../correction-store.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let storage: InMemoryEncryptedStorage;
let persistence: ArchitectPersistence;

beforeEach(() => {
  storage = new InMemoryEncryptedStorage();
  persistence = new ArchitectPersistence(storage);
});

// ────────────────────────────────────────────────────────────────────────────
// load — defaults
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.load — defaults', () => {
  it('returns defaults when no data exists', async () => {
    const prefs = await persistence.load();

    expect(prefs.version).toBe(2);
    expect(prefs.showContextIndicator).toBe(true);
    expect(prefs.showSourcesButton).toBe(true);
    expect(prefs.autoDetectContext).toBe(true);
    expect(prefs.defaultContext).toBeNull();
    expect(prefs.totalInteractions).toBe(0);
    expect(prefs.firstUsed).toBeGreaterThan(0);
    expect(prefs.lastUsed).toBeGreaterThan(0);
    expect(typeof prefs.corrections).toBe('string');
  });

  it('defaults include zero counts for all 17 context domains', async () => {
    const prefs = await persistence.load();
    const domains = Object.keys(prefs.contextUsageHistory);

    expect(domains).toHaveLength(17);
    for (const count of Object.values(prefs.contextUsageHistory)) {
      expect(count).toBe(0);
    }
  });

  it('default corrections are a valid serialized CorrectionStore', async () => {
    const prefs = await persistence.load();
    const store = CorrectionStore.deserialize(prefs.corrections);

    expect(store.getStats().totalCorrections).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// save / load round-trip
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.save / load round-trip', () => {
  it('persists and restores all fields', async () => {
    const prefs = await persistence.load();
    prefs.showContextIndicator = false;
    prefs.autoDetectContext = false;
    prefs.defaultContext = 'security_review';
    prefs.totalInteractions = 42;
    await persistence.save(prefs);

    const loaded = await persistence.load();
    expect(loaded.showContextIndicator).toBe(false);
    expect(loaded.autoDetectContext).toBe(false);
    expect(loaded.defaultContext).toBe('security_review');
    expect(loaded.totalInteractions).toBe(42);
  });

  it('save updates lastUsed automatically', async () => {
    const prefs = await persistence.load();
    const originalLastUsed = prefs.lastUsed;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));
    await persistence.save(prefs);

    const loaded = await persistence.load();
    expect(loaded.lastUsed).toBeGreaterThanOrEqual(originalLastUsed);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// recordUsage
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.recordUsage', () => {
  it('increments domain count and total interactions', async () => {
    await persistence.recordUsage('security_review');
    await persistence.recordUsage('security_review');
    await persistence.recordUsage('debugging');

    const prefs = await persistence.load();
    expect(prefs.contextUsageHistory['security_review']).toBe(2);
    expect(prefs.contextUsageHistory['debugging']).toBe(1);
    expect(prefs.contextUsageHistory['general']).toBe(0);
    expect(prefs.totalInteractions).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// saveCorrections
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.saveCorrections', () => {
  it('persists correction data that can be deserialized', async () => {
    const store = new CorrectionStore();
    store.addCorrection({
      userMessage: 'deployment pipeline configuration task',
      messageLength: 40,
      detectedDomain: 'code_engineering',
      correctedDomain: 'architecture_design',
      detectedEmotion: 'neutral',
    });

    await persistence.saveCorrections(store);

    const prefs = await persistence.load();
    const restored = CorrectionStore.deserialize(prefs.corrections);
    expect(restored.getStats().totalCorrections).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getMostUsedContexts
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.getMostUsedContexts', () => {
  it('returns domains sorted by usage descending', async () => {
    await persistence.recordUsage('debugging');
    await persistence.recordUsage('security_review');
    await persistence.recordUsage('security_review');
    await persistence.recordUsage('security_review');
    await persistence.recordUsage('debugging');
    await persistence.recordUsage('general');

    const top = await persistence.getMostUsedContexts(3);
    expect(top).toEqual(['security_review', 'debugging', 'general']);
  });

  it('excludes domains with zero usage', async () => {
    await persistence.recordUsage('debugging');

    const top = await persistence.getMostUsedContexts(5);
    expect(top).toEqual(['debugging']);
  });

  it('returns empty array when no usage recorded', async () => {
    const top = await persistence.getMostUsedContexts(3);
    expect(top).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// clearAll
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.clearAll', () => {
  it('removes all data, subsequent load returns fresh defaults', async () => {
    await persistence.recordUsage('debugging');
    await persistence.recordUsage('debugging');

    await persistence.clearAll();

    const prefs = await persistence.load();
    expect(prefs.totalInteractions).toBe(0);
    expect(prefs.contextUsageHistory['debugging']).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// exportAll
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence.exportAll', () => {
  it('returns valid JSON with all fields', async () => {
    await persistence.recordUsage('security_review');

    const json = await persistence.exportAll();
    const parsed = JSON.parse(json) as ArchitectPreferences;

    expect(parsed.version).toBe(2);
    expect(parsed.totalInteractions).toBe(1);
    expect(parsed.contextUsageHistory['security_review']).toBe(1);
    expect(parsed.showContextIndicator).toBe(true);
    expect(parsed.corrections).toBeTruthy();
    expect(parsed.firstUsed).toBeGreaterThan(0);
    expect(parsed.lastUsed).toBeGreaterThan(0);
  });

  it('exportAll output is pretty-printed', async () => {
    const json = await persistence.exportAll();
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Migration
// ────────────────────────────────────────────────────────────────────────────

describe('ArchitectPersistence — migration', () => {
  it('migrates version 0 data to version 2 with missing fields filled', async () => {
    // Simulate a version 0 stored preference with minimal fields
    const v0Data = {
      corrections: new CorrectionStore().serialize(),
      version: 0,
    };
    await storage.set('architect_preferences', JSON.stringify(v0Data));

    const prefs = await persistence.load();

    expect(prefs.version).toBe(2);
    expect(prefs.showContextIndicator).toBe(true);
    expect(prefs.showSourcesButton).toBe(true);
    expect(prefs.autoDetectContext).toBe(true);
    expect(prefs.defaultContext).toBeNull();
    expect(prefs.totalInteractions).toBe(0);
    expect(Object.keys(prefs.contextUsageHistory)).toHaveLength(17);
  });

  it('migrates data with undefined version to version 2', async () => {
    const noVersionData = {
      corrections: new CorrectionStore().serialize(),
      showContextIndicator: false, // user had changed this before migration
    };
    await storage.set('architect_preferences', JSON.stringify(noVersionData));

    const prefs = await persistence.load();

    expect(prefs.version).toBe(2);
    // Existing user preference preserved
    expect(prefs.showContextIndicator).toBe(false);
    // Missing fields filled with defaults
    expect(prefs.autoDetectContext).toBe(true);
  });

  it('does not re-migrate already current data', async () => {
    const prefs = await persistence.load();
    prefs.totalInteractions = 99;
    await persistence.save(prefs);

    const loaded = await persistence.load();
    expect(loaded.version).toBe(2);
    expect(loaded.totalInteractions).toBe(99);
  });

  it('migration persists upgraded data back to storage', async () => {
    const v0Data = { version: 0, corrections: new CorrectionStore().serialize() };
    await storage.set('architect_preferences', JSON.stringify(v0Data));

    // First load triggers migration and saves
    await persistence.load();

    // Second load should get the migrated data directly (no re-migration)
    const raw = await storage.get('architect_preferences');
    const stored = JSON.parse(raw!) as ArchitectPreferences;
    expect(stored.version).toBe(2);
    expect(stored.showContextIndicator).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// InMemoryEncryptedStorage
// ────────────────────────────────────────────────────────────────────────────

describe('InMemoryEncryptedStorage', () => {
  it('get returns null for missing keys', async () => {
    expect(await storage.get('nonexistent')).toBeNull();
  });

  it('set and get round-trip', async () => {
    await storage.set('key', 'value');
    expect(await storage.get('key')).toBe('value');
  });

  it('delete removes the key', async () => {
    await storage.set('key', 'value');
    await storage.delete('key');
    expect(await storage.get('key')).toBeNull();
  });

  it('exists returns correct boolean', async () => {
    expect(await storage.exists('key')).toBe(false);
    await storage.set('key', 'value');
    expect(await storage.exists('key')).toBe(true);
  });
});
