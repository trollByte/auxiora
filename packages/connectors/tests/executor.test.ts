import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConnectorRegistry } from '../src/registry.js';
import { AuthManager } from '../src/auth-manager.js';
import { ActionExecutor } from '../src/executor.js';
import { defineConnector } from '../src/define-connector.js';
import { TrustEngine, TrustGate, ActionAuditTrail } from '@auxiora/autonomy';

describe('ActionExecutor', () => {
  let tmpDir: string;
  let registry: ConnectorRegistry;
  let authManager: AuthManager;
  let trustGate: TrustGate;
  let auditTrail: ActionAuditTrail;
  let executor: ActionExecutor;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'executor-'));
    const engine = new TrustEngine({ defaultLevel: 2 }, path.join(tmpDir, 'state.json'));
    await engine.load();

    registry = new ConnectorRegistry();
    authManager = new AuthManager();
    trustGate = new TrustGate(engine);
    auditTrail = new ActionAuditTrail(path.join(tmpDir, 'audit.json'));
    executor = new ActionExecutor(registry, authManager, trustGate, auditTrail);

    // Register a test connector
    registry.register(
      defineConnector({
        id: 'test',
        name: 'Test',
        description: 'Test connector',
        version: '1.0.0',
        category: 'testing',
        auth: { type: 'api_key' },
        actions: [
          {
            id: 'do-thing',
            name: 'Do Thing',
            description: 'Does a thing',
            trustMinimum: 1,
            trustDomain: 'integrations',
            reversible: true,
            sideEffects: true,
            params: {},
          },
          {
            id: 'high-trust',
            name: 'High Trust Action',
            description: 'Needs high trust',
            trustMinimum: 4,
            trustDomain: 'integrations',
            reversible: false,
            sideEffects: true,
            params: {},
          },
        ],
        executeAction: async (actionId) => {
          if (actionId === 'do-thing') return { result: 'done' };
          throw new Error('Action failed');
        },
      }),
    );

    // Authenticate instance
    await authManager.authenticate('inst-1', { type: 'api_key' }, { apiKey: 'test-key' });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should execute an action successfully', async () => {
    const result = await executor.execute('test', 'do-thing', {}, 'inst-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: 'done' });
    expect(result.auditId).toBeDefined();
  });

  it('should deny action when trust level is insufficient', async () => {
    const result = await executor.execute('test', 'high-trust', {}, 'inst-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');
  });

  it('should fail for unknown connector', async () => {
    const result = await executor.execute('unknown', 'action', {}, 'inst-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail for unknown action', async () => {
    const result = await executor.execute('test', 'unknown', {}, 'inst-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail when no auth token exists', async () => {
    const result = await executor.execute('test', 'do-thing', {}, 'no-token');
    expect(result.success).toBe(false);
    expect(result.error).toContain('authentication token');
  });

  it('should record audit entry on success', async () => {
    const result = await executor.execute('test', 'do-thing', {}, 'inst-1');
    const entry = auditTrail.getById(result.auditId!);
    expect(entry).toBeDefined();
    expect(entry!.outcome).toBe('success');
    expect(entry!.executed).toBe(true);
  });

  it('should record audit entry on trust denial', async () => {
    const result = await executor.execute('test', 'high-trust', {}, 'inst-1');
    const entry = auditTrail.getById(result.auditId!);
    expect(entry).toBeDefined();
    expect(entry!.outcome).toBe('failure');
    expect(entry!.executed).toBe(false);
  });
});
