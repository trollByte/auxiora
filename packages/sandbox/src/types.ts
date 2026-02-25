export interface ResourceLimits {
  cpuShares: number;
  memoryMb: number;
  timeoutMs: number;
  pidsLimit: number;
}

export interface SandboxConfig {
  enabled: boolean;
  image: string;
  resourceLimits: ResourceLimits;
  allowedNetworkAccess: boolean;
  workspaceMountPath: string;
  dockerSocket: string;
}

export interface ContainerInfo {
  id: string;
  sessionId: string;
  image: string;
  status: ContainerStatus;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

export type ContainerStatus = 'created' | 'running' | 'stopped' | 'error';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface DockerApi {
  createContainer(options: CreateContainerOptions): Promise<string>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string, timeoutSeconds?: number): Promise<void>;
  removeContainer(containerId: string, force?: boolean): Promise<void>;
  execInContainer(containerId: string, command: string[], timeoutMs: number): Promise<ExecResult>;
  inspectContainer(containerId: string): Promise<{ running: boolean }>;
}

export interface CreateContainerOptions {
  image: string;
  name: string;
  cpuShares: number;
  memoryBytes: number;
  pidsLimit: number;
  networkDisabled: boolean;
  binds: string[];
  workingDir: string;
}

export const SANDBOX_DEFAULTS: SandboxConfig = {
  enabled: false,
  image: 'node:22-slim',
  resourceLimits: {
    cpuShares: 512,
    memoryMb: 256,
    timeoutMs: 30_000,
    pidsLimit: 64,
  },
  allowedNetworkAccess: false,
  workspaceMountPath: '/workspace',
  dockerSocket: '/var/run/docker.sock',
};
