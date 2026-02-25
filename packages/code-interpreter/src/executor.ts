import { execFile } from 'node:child_process';
import { getLogger } from '@auxiora/logger';
import type { ExecutionRequest, ExecutionResult, ExecutionStatus, Language } from './types.js';

const logger = getLogger('code-interpreter:executor');

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_MB = 256;

export class CodeExecutor {
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const memoryLimitMb = request.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB;

    const { command, args } = this.buildCommand(request.language, request.code, memoryLimitMb);

    logger.debug('Executing code', {
      language: request.language,
      timeoutMs,
      memoryLimitMb,
    });

    const startTime = performance.now();
    const controller = new AbortController();

    return new Promise<ExecutionResult>((resolve) => {
      const child = execFile(
        command,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, ...request.env },
          signal: controller.signal,
        },
        (err: unknown, stdout: string, stderr: string) => {
          const durationMs = Math.round(performance.now() - startTime);

          if (err) {
            const wrapped: Error = err instanceof Error ? err : new Error(String(err));
            const status = this.getErrorStatus(wrapped, timeoutMs);
            const exitCode = 'code' in wrapped && typeof (wrapped as NodeJS.ErrnoException).code === 'number'
              ? (wrapped as unknown as { code: number }).code
              : 1;

            resolve({
              status,
              stdout: stdout ?? '',
              stderr: stderr ?? wrapped.message,
              exitCode,
              durationMs,
            });
            return;
          }

          resolve({
            status: 'success',
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            exitCode: 0,
            durationMs,
          });
        },
      );

      // Handle process being killed
      child.on('error', () => {
        // Handled in the execFile callback
      });
    });
  }

  async isLanguageAvailable(lang: Language): Promise<boolean> {
    const commands: Record<Language, { cmd: string; args: string[] }> = {
      javascript: { cmd: 'node', args: ['--version'] },
      typescript: { cmd: 'node', args: ['--version'] },
      python: { cmd: 'python3', args: ['--version'] },
      shell: { cmd: 'sh', args: ['-c', 'echo ok'] },
    };

    const { cmd, args } = commands[lang];

    return new Promise<boolean>((resolve) => {
      execFile(cmd, args, { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });
  }

  private buildCommand(
    language: Language,
    code: string,
    memoryLimitMb: number,
  ): { command: string; args: string[] } {
    switch (language) {
      case 'javascript':
        return {
          command: 'node',
          args: [
            `--max-old-space-size=${memoryLimitMb}`,
            '--eval',
            code,
          ],
        };
      case 'typescript':
        return {
          command: 'node',
          args: [
            `--max-old-space-size=${memoryLimitMb}`,
            '--experimental-strip-types',
            '--eval',
            code,
          ],
        };
      case 'python':
        return {
          command: 'python3',
          args: ['-c', code],
        };
      case 'shell':
        return {
          command: 'sh',
          args: ['-c', code],
        };
    }
  }

  private getErrorStatus(err: Error, _timeoutMs: number): ExecutionStatus {
    const errnoErr = err as NodeJS.ErrnoException;

    // Timeout: killed by execFile timeout or explicit ETIMEDOUT
    if (
      errnoErr.code === 'ETIMEDOUT' ||
      (err.message && err.message.includes('timed out')) ||
      ('killed' in err && (err as { killed: boolean }).killed)
    ) {
      return 'timeout';
    }

    if (errnoErr.code === 'ABORT_ERR') {
      return 'killed';
    }

    return 'error';
  }
}
