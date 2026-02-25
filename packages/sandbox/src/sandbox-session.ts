import type {
  ContainerInfo,
  ContainerStatus,
  DockerApi,
  ExecResult,
  ResourceLimits,
} from './types.js';

export interface SandboxSessionOptions {
  sessionId: string;
  image: string;
  resourceLimits: ResourceLimits;
  allowNetwork: boolean;
  workspaceDir: string;
  mountPath: string;
  dockerApi: DockerApi;
}

export class SandboxSession {
  readonly sessionId: string;
  private containerId: string | null = null;
  private status: ContainerStatus = 'created';
  private image: string;
  private resourceLimits: ResourceLimits;
  private allowNetwork: boolean;
  private workspaceDir: string;
  private mountPath: string;
  private dockerApi: DockerApi;
  private createdAt: string;
  private startedAt?: string;
  private stoppedAt?: string;

  constructor(options: SandboxSessionOptions) {
    this.sessionId = options.sessionId;
    this.image = options.image;
    this.resourceLimits = options.resourceLimits;
    this.allowNetwork = options.allowNetwork;
    this.workspaceDir = options.workspaceDir;
    this.mountPath = options.mountPath;
    this.dockerApi = options.dockerApi;
    this.createdAt = new Date().toISOString();
  }

  async start(): Promise<void> {
    if (this.containerId) {
      throw new Error(`Session ${this.sessionId} already has a container`);
    }

    const containerName = `auxiora-sandbox-${this.sessionId}`;

    this.containerId = await this.dockerApi.createContainer({
      image: this.image,
      name: containerName,
      cpuShares: this.resourceLimits.cpuShares,
      memoryBytes: this.resourceLimits.memoryMb * 1024 * 1024,
      pidsLimit: this.resourceLimits.pidsLimit,
      networkDisabled: !this.allowNetwork,
      binds: [`${this.workspaceDir}:${this.mountPath}:rw`],
      workingDir: this.mountPath,
    });

    await this.dockerApi.startContainer(this.containerId);
    this.status = 'running';
    this.startedAt = new Date().toISOString();
  }

  async runCommand(command: string[]): Promise<ExecResult> {
    if (!this.containerId || this.status !== 'running') {
      throw new Error(`Session ${this.sessionId} is not running`);
    }

    return this.dockerApi.execInContainer(
      this.containerId,
      command,
      this.resourceLimits.timeoutMs
    );
  }

  async stop(): Promise<void> {
    if (!this.containerId) return;

    if (this.status === 'running') {
      await this.dockerApi.stopContainer(this.containerId, 5);
    }

    await this.dockerApi.removeContainer(this.containerId, true);
    this.status = 'stopped';
    this.stoppedAt = new Date().toISOString();
    this.containerId = null;
  }

  getInfo(): ContainerInfo {
    return {
      id: this.containerId ?? '',
      sessionId: this.sessionId,
      image: this.image,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
    };
  }

  getStatus(): ContainerStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.status === 'running';
  }
}
