import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDoctorCommand } from '../src/commands/doctor.js';
import type { CheckResult } from '../src/commands/doctor.js';

// Mock external dependencies to avoid filesystem/network side effects
vi.mock('@auxiora/core', () => ({
  getVaultPath: () => '/mock/vault.json',
  getConfigPath: () => '/mock/config.json',
  getAuditLogPath: () => '/mock/audit.log',
  getWorkspacePath: () => '/mock/workspace',
  getMemoryDir: () => '/mock/memory',
  getPluginsDir: () => '/mock/plugins',
  isWindows: () => false,
}));

vi.mock('@auxiora/audit', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockResolvedValue({ valid: true, entries: 10 }),
  })),
}));

vi.mock('@auxiora/config', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

describe('doctor CLI command', () => {
  it('should create the doctor command', () => {
    const cmd = createDoctorCommand();
    expect(cmd.name()).toBe('doctor');
  });

  it('should have a description', () => {
    const cmd = createDoctorCommand();
    expect(cmd.description()).toContain('diagnostics');
  });

  it('should support --fix option', () => {
    const cmd = createDoctorCommand();
    const fixOption = cmd.options.find(o => o.long === '--fix');
    expect(fixOption).toBeDefined();
    expect(fixOption!.description).toContain('Auto-fix');
  });
});

describe('CheckResult interface', () => {
  it('should allow creating a passing check result', () => {
    const result: CheckResult = {
      name: 'Test',
      category: 'Test',
      status: 'pass',
      message: 'All good',
    };
    expect(result.status).toBe('pass');
    expect(result.fixable).toBeUndefined();
  });

  it('should allow creating a fixable check result', () => {
    const result: CheckResult = {
      name: 'Permissions',
      category: 'Config',
      status: 'warn',
      message: 'Bad permissions',
      fixable: true,
      fix: async () => 'Fixed',
    };
    expect(result.fixable).toBe(true);
    expect(result.fix).toBeDefined();
  });

  it('should support all three status types', () => {
    const statuses: CheckResult['status'][] = ['pass', 'warn', 'fail'];
    for (const status of statuses) {
      const result: CheckResult = {
        name: 'Test',
        category: 'Test',
        status,
        message: `Status: ${status}`,
      };
      expect(result.status).toBe(status);
    }
  });
});

describe('runDoctorChecks', () => {
  let runDoctorChecks: () => Promise<CheckResult[]>;

  beforeEach(async () => {
    // Dynamic import after mocks are set up
    const mod = await import('../src/commands/doctor.js');
    runDoctorChecks = mod.runDoctorChecks;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return an array of check results', async () => {
    const results = await runDoctorChecks();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should include system checks', async () => {
    const results = await runDoctorChecks();
    const systemChecks = results.filter(r => r.category === 'System');
    expect(systemChecks.length).toBeGreaterThan(0);

    const nodeCheck = systemChecks.find(r => r.name === 'Node.js');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass');
  });

  it('should include a memory check for Node >= 22', async () => {
    const results = await runDoctorChecks();
    const memCheck = results.find(r => r.name === 'System memory');
    expect(memCheck).toBeDefined();
    expect(memCheck!.category).toBe('System');
  });

  it('should report categories for all results', async () => {
    const results = await runDoctorChecks();
    for (const result of results) {
      expect(result.category).toBeTruthy();
      expect(typeof result.category).toBe('string');
    }
  });

  it('should have valid status values for all results', async () => {
    const results = await runDoctorChecks();
    const validStatuses = new Set(['pass', 'warn', 'fail']);
    for (const result of results) {
      expect(validStatuses.has(result.status)).toBe(true);
    }
  });
});
