import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CheckResult } from '../src/commands/doctor.js';

// Mock the doctor module
vi.mock('../src/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn(),
}));

// Mock the logger
vi.mock('@auxiora/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { StartupAuditor } from '../src/startup-auditor.js';
import { runDoctorChecks } from '../src/commands/doctor.js';

const mockRunDoctorChecks = vi.mocked(runDoctorChecks);

function makeResult(overrides: Partial<CheckResult> & { name: string; category: string }): CheckResult {
  return {
    status: 'pass',
    message: 'OK',
    ...overrides,
  };
}

describe('StartupAuditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns canStart=true when all checks pass', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
      makeResult({ name: 'Node.js', category: 'System' }),
      makeResult({ name: 'Vault', category: 'Vault' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.canStart).toBe(true);
    expect(summary.blockers).toHaveLength(0);
  });

  it('returns canStart=false when a critical category fails', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config validation', category: 'Config', status: 'fail', message: 'Invalid config' }),
      makeResult({ name: 'Vault', category: 'Vault' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.canStart).toBe(false);
    expect(summary.blockers).toHaveLength(1);
    expect(summary.blockers[0].name).toBe('Config validation');
  });

  it('returns canStart=true when non-critical category fails', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Chain broken' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.canStart).toBe(true);
    expect(summary.blockers).toHaveLength(0);
  });

  it('skips categories in skipCategories', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
      makeResult({ name: 'Internet', category: 'Network', status: 'warn', message: 'Offline' }),
      makeResult({ name: 'Docker', category: 'Docker', status: 'warn', message: 'Not installed' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    // Network and Docker are skipped by default
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].name).toBe('Config file');
    expect(summary.warnings).toBe(0);
  });

  it('counts passed/warnings/failures correctly', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config', status: 'pass' }),
      makeResult({ name: 'Vault', category: 'Vault', status: 'warn', message: 'Not initialized' }),
      makeResult({ name: 'Memory', category: 'Memory', status: 'warn', message: 'Not initialized' }),
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Chain broken' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.passed).toBe(1);
    expect(summary.warnings).toBe(2);
    expect(summary.failures).toBe(1);
  });

  it('blockers only include critical category failures', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config validation', category: 'Config', status: 'fail', message: 'Bad config' }),
      makeResult({ name: 'Node.js', category: 'System', status: 'fail', message: 'Too old' }),
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Chain broken' }),
      makeResult({ name: 'Plugins', category: 'Plugins', status: 'fail', message: 'Cannot read' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.blockers).toHaveLength(2);
    const blockerNames = summary.blockers.map(b => b.name);
    expect(blockerNames).toContain('Config validation');
    expect(blockerNames).toContain('Node.js');
    expect(blockerNames).not.toContain('Audit log');
    expect(blockerNames).not.toContain('Plugins');
  });

  it('notices include all non-pass results', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config', status: 'pass' }),
      makeResult({ name: 'Vault', category: 'Vault', status: 'warn', message: 'Not initialized' }),
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Chain broken' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.notices).toHaveLength(2);
    const noticeNames = summary.notices.map(n => n.name);
    expect(noticeNames).toContain('Vault');
    expect(noticeNames).toContain('Audit log');
  });

  it('durationMs is greater than 0', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.audit();

    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('auditAndFix calls fix on fixable results', async () => {
    const fixFn = vi.fn().mockResolvedValue('Fixed');

    // First call returns a fixable warning, second call (re-audit) returns all pass
    mockRunDoctorChecks
      .mockResolvedValueOnce([
        makeResult({ name: 'Vault perms', category: 'Vault', status: 'warn', message: 'Bad perms', fixable: true, fix: fixFn }),
      ])
      .mockResolvedValueOnce([
        makeResult({ name: 'Vault perms', category: 'Vault', status: 'pass', message: 'Fixed' }),
      ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.auditAndFix();

    expect(fixFn).toHaveBeenCalledOnce();
    expect(summary.canStart).toBe(true);
    expect(summary.warnings).toBe(0);
  });

  it('auditAndFix skips re-audit when no fixes applied', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Chain broken' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.auditAndFix();

    // Only one call — no re-audit since nothing was fixable
    expect(mockRunDoctorChecks).toHaveBeenCalledTimes(1);
    expect(summary.failures).toBe(1);
  });

  it('auditAndFix returns first pass when everything is clean', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
      makeResult({ name: 'Node.js', category: 'System' }),
    ]);

    const auditor = new StartupAuditor();
    const summary = await auditor.auditAndFix();

    // Only one call — no need to fix or re-audit
    expect(mockRunDoctorChecks).toHaveBeenCalledTimes(1);
    expect(summary.canStart).toBe(true);
  });

  it('respects custom skipCategories', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Config file', category: 'Config' }),
      makeResult({ name: 'Vault', category: 'Vault', status: 'warn', message: 'Not init' }),
    ]);

    const auditor = new StartupAuditor({ skipCategories: ['Vault'] });
    const summary = await auditor.audit();

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].category).toBe('Config');
  });

  it('respects custom criticalCategories', async () => {
    mockRunDoctorChecks.mockResolvedValue([
      makeResult({ name: 'Audit log', category: 'Audit', status: 'fail', message: 'Broken' }),
    ]);

    const auditor = new StartupAuditor({ criticalCategories: ['Audit'] });
    const summary = await auditor.audit();

    expect(summary.canStart).toBe(false);
    expect(summary.blockers).toHaveLength(1);
    expect(summary.blockers[0].category).toBe('Audit');
  });
});
