import { execFile } from 'node:child_process';

export interface ExecResult {
  status: 'ok' | 'error';
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ExecOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Safe subprocess execution using execFile (no shell, no injection).
 * Never throws — returns a result object with status.
 */
export function safeExecFile(
  command: string,
  args: string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: options?.timeoutMs ?? 120_000,
        cwd: options?.cwd,
        env: options?.env ?? process.env,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            status: 'error',
            stdout: stdout ?? '',
            stderr: stderr || error.message,
            exitCode: error.code != null ? (typeof error.code === 'number' ? error.code : 1) : 1,
          });
          return;
        }
        resolve({
          status: 'ok',
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: 0,
        });
      },
    );
  });
}
