import { nanoid } from 'nanoid';
import { SandboxSession, type SandboxSessionOptions } from './sandbox-session.js';
import type { DockerApi, ExecResult, SandboxConfig } from './types.js';
import { SANDBOX_DEFAULTS } from './types.js';

export interface SandboxManagerOptions {
  config?: Partial<SandboxConfig>;
  dockerApi: DockerApi;
}

export class SandboxManager {
  private sessions: Map<string, SandboxSession> = new Map();
  private config: SandboxConfig;
  private dockerApi: DockerApi;

  constructor(options: SandboxManagerOptions) {
    this.config = { ...SANDBOX_DEFAULTS, ...options.config };
    this.dockerApi = options.dockerApi;
  }

  async createSession(sessionId: string, workspaceDir: string): Promise<SandboxSession> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Sandbox session ${sessionId} already exists`);
    }

    const session = new SandboxSession({
      sessionId,
      image: this.config.image,
      resourceLimits: this.config.resourceLimits,
      allowNetwork: this.config.allowedNetworkAccess,
      workspaceDir,
      mountPath: this.config.workspaceMountPath,
      dockerApi: this.dockerApi,
    });

    await session.start();
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  async runInSandbox(sessionId: string, command: string[]): Promise<ExecResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No sandbox session found for ${sessionId}`);
    }
    return session.runCommand(command);
  }

  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.stop();
    this.sessions.delete(sessionId);
    return true;
  }

  async destroyAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      promises.push(session.stop());
    }
    await Promise.allSettled(promises);
    this.sessions.clear();
  }

  getActiveSessions(): SandboxSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isRunning());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }
}
