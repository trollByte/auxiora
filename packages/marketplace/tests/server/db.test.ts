import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { RegistryDatabase } from '../../src/server/db.js';
import type { PluginInput, PersonalityInput } from '../../src/server/db.js';

const samplePlugin: PluginInput = {
  name: 'weather-plugin',
  version: '1.0.0',
  description: 'Provides weather forecasts',
  author: 'alice',
  license: 'MIT',
  permissions: ['NETWORK', 'STORAGE'],
  keywords: ['weather', 'forecast'],
  homepage: 'https://example.com/weather',
  repository: 'https://github.com/alice/weather-plugin',
};

const samplePersonality: PersonalityInput = {
  name: 'friendly-bot',
  version: '1.0.0',
  description: 'A warm and friendly assistant',
  author: 'bob',
  preview: 'Hey there! How can I help you today?',
  tone: { warmth: 0.9, humor: 0.6, formality: 0.3 },
  keywords: ['friendly', 'casual'],
};

describe('RegistryDatabase', () => {
  let db: RegistryDatabase;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'registry-db-'));
    db = new RegistryDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('plugins', () => {
    it('should insert and retrieve a plugin', () => {
      db.upsertPlugin(samplePlugin);
      const plugin = db.getPlugin('weather-plugin');

      expect(plugin).not.toBeNull();
      expect(plugin!.name).toBe('weather-plugin');
      expect(plugin!.version).toBe('1.0.0');
      expect(plugin!.description).toBe('Provides weather forecasts');
      expect(plugin!.author).toBe('alice');
      expect(plugin!.license).toBe('MIT');
      expect(plugin!.permissions).toEqual(['NETWORK', 'STORAGE']);
      expect(plugin!.keywords).toEqual(['weather', 'forecast']);
      expect(plugin!.downloads).toBe(0);
      expect(plugin!.rating).toBe(0);
      expect(plugin!.homepage).toBe('https://example.com/weather');
      expect(plugin!.repository).toBe('https://github.com/alice/weather-plugin');
      expect(plugin!.createdAt).toBeDefined();
      expect(plugin!.updatedAt).toBeDefined();
    });

    it('should return null for non-existent plugin', () => {
      expect(db.getPlugin('nonexistent')).toBeNull();
    });

    it('should search plugins by query matching name', () => {
      db.upsertPlugin(samplePlugin);
      db.upsertPlugin({
        ...samplePlugin,
        name: 'calendar-plugin',
        description: 'Calendar integration',
        keywords: ['calendar'],
      });

      const result = db.searchPlugins({ query: 'weather' });
      expect(result.total).toBe(1);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0]!.name).toBe('weather-plugin');
    });

    it('should search plugins by query matching description', () => {
      db.upsertPlugin(samplePlugin);
      const result = db.searchPlugins({ query: 'forecast' });
      expect(result.total).toBe(1);
      expect(result.plugins[0]!.name).toBe('weather-plugin');
    });

    it('should search plugins by author', () => {
      db.upsertPlugin(samplePlugin);
      db.upsertPlugin({
        ...samplePlugin,
        name: 'other-plugin',
        description: 'Another plugin',
        author: 'charlie',
      });

      const result = db.searchPlugins({ author: 'alice' });
      expect(result.total).toBe(1);
      expect(result.plugins[0]!.name).toBe('weather-plugin');
    });

    it('should paginate results', () => {
      for (let i = 0; i < 25; i++) {
        db.upsertPlugin({
          ...samplePlugin,
          name: `plugin-${String(i).padStart(3, '0')}`,
          description: `Plugin number ${i}`,
        });
      }

      const page1 = db.searchPlugins({ limit: 10, offset: 0 });
      expect(page1.plugins).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.limit).toBe(10);
      expect(page1.offset).toBe(0);

      const page2 = db.searchPlugins({ limit: 10, offset: 10 });
      expect(page2.plugins).toHaveLength(10);
      expect(page2.total).toBe(25);

      const page3 = db.searchPlugins({ limit: 10, offset: 20 });
      expect(page3.plugins).toHaveLength(5);
      expect(page3.total).toBe(25);
    });

    it('should increment download count', () => {
      db.upsertPlugin(samplePlugin);
      db.incrementDownloads('weather-plugin');
      db.incrementDownloads('weather-plugin');
      db.incrementDownloads('weather-plugin');

      const plugin = db.getPlugin('weather-plugin');
      expect(plugin!.downloads).toBe(3);
    });

    it('should preserve downloads on upsert update', () => {
      db.upsertPlugin(samplePlugin);
      db.incrementDownloads('weather-plugin');
      db.incrementDownloads('weather-plugin');

      db.upsertPlugin({ ...samplePlugin, version: '2.0.0' });

      const plugin = db.getPlugin('weather-plugin');
      expect(plugin!.version).toBe('2.0.0');
      expect(plugin!.downloads).toBe(2);
    });

    it('should return default search options', () => {
      const result = db.searchPlugins();
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.total).toBe(0);
      expect(result.plugins).toEqual([]);
    });
  });

  describe('personalities', () => {
    it('should insert and retrieve a personality', () => {
      db.upsertPersonality(samplePersonality);
      const personality = db.getPersonality('friendly-bot');

      expect(personality).not.toBeNull();
      expect(personality!.name).toBe('friendly-bot');
      expect(personality!.version).toBe('1.0.0');
      expect(personality!.description).toBe('A warm and friendly assistant');
      expect(personality!.author).toBe('bob');
      expect(personality!.preview).toBe('Hey there! How can I help you today?');
      expect(personality!.tone).toEqual({ warmth: 0.9, humor: 0.6, formality: 0.3 });
      expect(personality!.keywords).toEqual(['friendly', 'casual']);
      expect(personality!.downloads).toBe(0);
      expect(personality!.rating).toBe(0);
      expect(personality!.createdAt).toBeDefined();
      expect(personality!.updatedAt).toBeDefined();
    });

    it('should return null for non-existent personality', () => {
      expect(db.getPersonality('nonexistent')).toBeNull();
    });

    it('should search personalities by query', () => {
      db.upsertPersonality(samplePersonality);
      db.upsertPersonality({
        ...samplePersonality,
        name: 'formal-bot',
        description: 'A formal and professional assistant',
        keywords: ['formal'],
      });

      const result = db.searchPersonalities({ query: 'friendly' });
      expect(result.total).toBe(1);
      expect(result.personalities).toHaveLength(1);
      expect(result.personalities[0]!.name).toBe('friendly-bot');
    });

    it('should increment personality download count', () => {
      db.upsertPersonality(samplePersonality);
      db.incrementPersonalityDownloads('friendly-bot');
      db.incrementPersonalityDownloads('friendly-bot');

      const personality = db.getPersonality('friendly-bot');
      expect(personality!.downloads).toBe(2);
    });

    it('should preserve personality downloads on upsert update', () => {
      db.upsertPersonality(samplePersonality);
      db.incrementPersonalityDownloads('friendly-bot');

      db.upsertPersonality({ ...samplePersonality, version: '2.0.0' });

      const personality = db.getPersonality('friendly-bot');
      expect(personality!.version).toBe('2.0.0');
      expect(personality!.downloads).toBe(1);
    });
  });
});
