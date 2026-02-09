import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SandboxSession } from '../src/sandbox-session.js';
import { SandboxManager } from '../src/sandbox-manager.js';
import type { DockerApi, ExecResult, CreateContainerOptions } from '../src/types.js';

function createMockDockerApi(): DockerApi & {
  containers: Map<string, { running: boolean; options: CreateContainerOptions }>;
} {
  const containers = new Map<string, { running: boolean; options: CreateContainerOptions }>();
  let nextId = 1;

  return {
    containers,

    async createContainer(options: CreateContainerOptions): Promise<string> {
      const id = `container-${nextId++}`;
      containers.set(id, { running: false, options });
      return id;
    },

    async startContainer(containerId: string): Promise<void> {
      const container = containers.get(containerId);
      if (!container) throw new Error(`Container ${containerId} not found`);
      container.running = true;
    },

    async stopContainer(containerId: string): Promise<void> {
      const container = containers.get(containerId);
      if (!container) throw new Error(`Container ${containerId} not found`);
      container.running = false;
    },

    async removeContainer(containerId: string): Promise<void> {
      containers.delete(containerId);
    },

    async execInContainer(containerId: string, command: string[], timeoutMs: number): Promise<ExecResult> {
      const container = containers.get(containerId);
      if (!container || !container.running) {
        throw new Error(`Container ${containerId} not running`);
      }
      return {
        exitCode: 0,
        stdout: `Executed: ${command.join(' ')}`,
        stderr: '',
        timedOut: false,
      };
    },

    async inspectContainer(containerId: string): Promise<{ running: boolean }> {
      const container = containers.get(containerId);
      if (!container) throw new Error(`Container ${containerId} not found`);
      return { running: container.running };
    },
  };
}

describe('SandboxSession', () => {
  let dockerApi: ReturnType<typeof createMockDockerApi>;

  beforeEach(() => {
    dockerApi = createMockDockerApi();
  });

  it('should create and start a container', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-1',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/home/user/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await session.start();
    expect(session.isRunning()).toBe(true);
    expect(session.getStatus()).toBe('running');
    expect(dockerApi.containers.size).toBe(1);
  });

  it('should pass correct container options', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-2',
      image: 'python:3.12-slim',
      resourceLimits: { cpuShares: 256, memoryMb: 128, timeoutMs: 10000, pidsLimit: 32 },
      allowNetwork: true,
      workspaceDir: '/data/work',
      mountPath: '/app',
      dockerApi,
    });

    await session.start();
    const container = Array.from(dockerApi.containers.values())[0];
    expect(container.options.image).toBe('python:3.12-slim');
    expect(container.options.cpuShares).toBe(256);
    expect(container.options.memoryBytes).toBe(128 * 1024 * 1024);
    expect(container.options.pidsLimit).toBe(32);
    expect(container.options.networkDisabled).toBe(false);
    expect(container.options.binds).toEqual(['/data/work:/app:rw']);
    expect(container.options.workingDir).toBe('/app');
  });

  it('should throw when starting twice', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-3',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await session.start();
    await expect(session.start()).rejects.toThrow('already has a container');
  });

  it('should run commands in container', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-4',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await session.start();
    const result = await session.runCommand(['node', '-e', 'console.log("hi")']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('node');
    expect(result.timedOut).toBe(false);
  });

  it('should throw when running command on stopped session', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-5',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await expect(session.runCommand(['ls'])).rejects.toThrow('not running');
  });

  it('should stop and clean up container', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-6',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await session.start();
    expect(dockerApi.containers.size).toBe(1);

    await session.stop();
    expect(session.isRunning()).toBe(false);
    expect(session.getStatus()).toBe('stopped');
    expect(dockerApi.containers.size).toBe(0);
  });

  it('should handle stop on unstarted session', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-7',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    // Should not throw
    await session.stop();
    expect(session.getStatus()).toBe('created');
  });

  it('should return container info', async () => {
    const session = new SandboxSession({
      sessionId: 'sess-8',
      image: 'node:22-slim',
      resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
      allowNetwork: false,
      workspaceDir: '/workspace',
      mountPath: '/workspace',
      dockerApi,
    });

    await session.start();
    const info = session.getInfo();
    expect(info.sessionId).toBe('sess-8');
    expect(info.image).toBe('node:22-slim');
    expect(info.status).toBe('running');
    expect(info.createdAt).toBeTruthy();
    expect(info.startedAt).toBeTruthy();
  });
});

describe('SandboxManager', () => {
  let dockerApi: ReturnType<typeof createMockDockerApi>;
  let manager: SandboxManager;

  beforeEach(() => {
    dockerApi = createMockDockerApi();
    manager = new SandboxManager({
      config: {
        enabled: true,
        image: 'node:22-slim',
        resourceLimits: { cpuShares: 512, memoryMb: 256, timeoutMs: 30000, pidsLimit: 64 },
        allowedNetworkAccess: false,
      },
      dockerApi,
    });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it('should create a sandboxed session', async () => {
    const session = await manager.createSession('sess-1', '/workspace');
    expect(session.isRunning()).toBe(true);
    expect(manager.getSessionCount()).toBe(1);
  });

  it('should throw when creating duplicate session', async () => {
    await manager.createSession('sess-1', '/workspace');
    await expect(manager.createSession('sess-1', '/workspace')).rejects.toThrow('already exists');
  });

  it('should get session by id', async () => {
    await manager.createSession('sess-1', '/workspace');
    const session = manager.getSession('sess-1');
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe('sess-1');
  });

  it('should return undefined for unknown session', () => {
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('should run commands in sandbox', async () => {
    await manager.createSession('sess-1', '/workspace');
    const result = await manager.runInSandbox('sess-1', ['echo', 'hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('echo');
  });

  it('should throw when running command on unknown session', async () => {
    await expect(manager.runInSandbox('unknown', ['ls'])).rejects.toThrow('No sandbox session found');
  });

  it('should destroy a session', async () => {
    await manager.createSession('sess-1', '/workspace');
    const destroyed = await manager.destroySession('sess-1');
    expect(destroyed).toBe(true);
    expect(manager.getSessionCount()).toBe(0);
    expect(dockerApi.containers.size).toBe(0);
  });

  it('should return false when destroying unknown session', async () => {
    const destroyed = await manager.destroySession('nonexistent');
    expect(destroyed).toBe(false);
  });

  it('should destroy all sessions', async () => {
    await manager.createSession('sess-1', '/workspace');
    await manager.createSession('sess-2', '/workspace');
    expect(manager.getSessionCount()).toBe(2);

    await manager.destroyAll();
    expect(manager.getSessionCount()).toBe(0);
    expect(dockerApi.containers.size).toBe(0);
  });

  it('should list active sessions', async () => {
    await manager.createSession('sess-1', '/workspace');
    await manager.createSession('sess-2', '/workspace');
    const active = manager.getActiveSessions();
    expect(active).toHaveLength(2);
  });

  it('should report enabled status', () => {
    expect(manager.isEnabled()).toBe(true);

    const disabledManager = new SandboxManager({
      config: { enabled: false },
      dockerApi,
    });
    expect(disabledManager.isEnabled()).toBe(false);
  });
});
