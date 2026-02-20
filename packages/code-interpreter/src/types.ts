export type Language = 'javascript' | 'typescript' | 'python' | 'shell';
export type ExecutionStatus = 'success' | 'error' | 'timeout' | 'killed';

export interface ExecutionRequest {
  code: string;
  language: Language;
  timeoutMs?: number;
  memoryLimitMb?: number;
  env?: Record<string, string>;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  memoryUsedMb?: number;
}

export interface ReplSession {
  id: string;
  language: Language;
  createdAt: number;
  lastActivity: number;
  history: Array<{ code: string; result: ExecutionResult }>;
}

export interface InterpreterConfig {
  maxSessions?: number;
  defaultTimeout?: number;
  defaultMemoryLimit?: number;
  allowedLanguages?: Language[];
}
