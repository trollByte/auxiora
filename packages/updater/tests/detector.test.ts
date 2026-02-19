import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstallationDetector } from '../src/detector.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('InstallationDetector', () => {
  let detector: InstallationDetector;
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];

  beforeEach(() => {
    detector = new InstallationDetector();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    // Also mock readFileSync for readPackageVersion
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.3.0' }));
    delete process.env.AUXIORA_INSTALL_METHOD;
    delete process.env.KUBERNETES_SERVICE_HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it('detects docker when /.dockerenv exists', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p) === '/.dockerenv' ? true : false,
    );
    const info = detector.detect();
    expect(info.method).toBe('docker');
  });

  it('detects k8s when KUBERNETES_SERVICE_HOST is set', () => {
    process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
    const info = detector.detect();
    expect(info.method).toBe('k8s');
  });

  it('respects AUXIORA_INSTALL_METHOD override', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'tarball';
    const info = detector.detect();
    expect(info.method).toBe('tarball');
  });

  it('detects brew from executable path', () => {
    process.argv[1] = '/opt/homebrew/Cellar/auxiora/1.0/bin/auxiora';
    const info = detector.detect();
    expect(info.method).toBe('brew');
  });

  it('detects apt from dpkg metadata', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p) === '/var/lib/dpkg/info/auxiora.list' ? true : false,
    );
    const info = detector.detect();
    expect(info.method).toBe('apt');
    expect(info.requiresSudo).toBe(true);
  });

  it('detects git when .git directory exists in project root', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      // Allow package.json to be found (for findProjectRoot) and .git
      if (s.endsWith('package.json') || s.endsWith('.git')) return true;
      return false;
    });
    const info = detector.detect();
    expect(info.method).toBe('git');
  });

  it('returns unknown when nothing matches', () => {
    process.argv[1] = '/usr/bin/auxiora';
    const info = detector.detect();
    expect(info.method).toBe('unknown');
    expect(info.canSelfUpdate).toBe(false);
  });

  it('sets canSelfUpdate true for known methods', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'npm';
    const info = detector.detect();
    expect(info.canSelfUpdate).toBe(true);
  });

  it('reads version from package.json', () => {
    process.env.AUXIORA_INSTALL_METHOD = 'npm';
    const info = detector.detect();
    expect(info.currentVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
