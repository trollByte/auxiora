import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PackageStorage } from '../../src/server/storage.js';

let storage: PackageStorage;
let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiora-registry-storage-'));
  storage = new PackageStorage(testDir);
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('PackageStorage', () => {
  it('should store and retrieve a plugin package', async () => {
    const content = Buffer.from('fake-tarball-data');
    await storage.store('plugins', 'my-plugin', '1.0.0', content);
    const retrieved = await storage.retrieve('plugins', 'my-plugin', '1.0.0');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.equals(content)).toBe(true);
  });

  it('should return null for non-existent package', async () => {
    const result = await storage.retrieve('plugins', 'no-such-pkg', '0.0.1');
    expect(result).toBeNull();
  });

  it('should list versions for a package', async () => {
    await storage.store('plugins', 'versioned', '1.0.0', Buffer.from('v1'));
    await storage.store('plugins', 'versioned', '2.0.0', Buffer.from('v2'));
    const versions = await storage.listVersions('plugins', 'versioned');
    expect(versions).toContain('1.0.0');
    expect(versions).toContain('2.0.0');
    expect(versions).toHaveLength(2);
  });

  it('should delete a specific version', async () => {
    await storage.store('plugins', 'removable', '1.0.0', Buffer.from('data'));
    await storage.remove('plugins', 'removable', '1.0.0');
    const result = await storage.retrieve('plugins', 'removable', '1.0.0');
    expect(result).toBeNull();
  });

  it('should prevent path traversal in name', async () => {
    await expect(
      storage.store('plugins', '../escape', '1.0.0', Buffer.from('bad')),
    ).rejects.toThrow('Invalid package name');
  });

  it('should store personality packages in separate namespace', async () => {
    const pluginContent = Buffer.from('plugin-data');
    const personalityContent = Buffer.from('personality-data');
    await storage.store('plugins', 'shared-name', '1.0.0', pluginContent);
    await storage.store('personalities', 'shared-name', '1.0.0', personalityContent);

    const retrievedPlugin = await storage.retrieve('plugins', 'shared-name', '1.0.0');
    const retrievedPersonality = await storage.retrieve('personalities', 'shared-name', '1.0.0');

    expect(retrievedPlugin!.equals(pluginContent)).toBe(true);
    expect(retrievedPersonality!.equals(personalityContent)).toBe(true);
    expect(retrievedPlugin!.equals(retrievedPersonality!)).toBe(false);
  });
});
