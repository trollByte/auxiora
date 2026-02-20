import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeExecutor } from '../src/executor.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock logger
vi.mock('@auxiora/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { execFile } from 'node:child_process';

const mockedExecFile = vi.mocked(execFile);

describe('CodeExecutor', () => {
  let executor: CodeExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new CodeExecutor();
  });

  describe('execute', () => {
    it('should execute JavaScript code successfully', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'hello world\n', '');
        return {} as any;
      });

      const result = await executor.execute({
        code: 'console.log("hello world")',
        language: 'javascript',
      });

      expect(result.status).toBe('success');
      expect(result.stdout).toBe('hello world\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass --eval flag for JavaScript', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, '', '');
        return {} as any;
      });

      await executor.execute({
        code: 'console.log(1)',
        language: 'javascript',
      });

      expect(mockedExecFile).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining(['--eval', 'console.log(1)']),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should pass --experimental-strip-types for TypeScript', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, '', '');
        return {} as any;
      });

      await executor.execute({
        code: 'const x: number = 1; console.log(x)',
        language: 'typescript',
      });

      expect(mockedExecFile).toHaveBeenCalledWith(
        'node',
        expect.arrayContaining(['--experimental-strip-types', '--eval']),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should use python3 -c for Python', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, '42\n', '');
        return {} as any;
      });

      await executor.execute({
        code: 'print(42)',
        language: 'python',
      });

      expect(mockedExecFile).toHaveBeenCalledWith(
        'python3',
        ['-c', 'print(42)'],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should use sh -c for shell', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'hi\n', '');
        return {} as any;
      });

      await executor.execute({
        code: 'echo hi',
        language: 'shell',
      });

      expect(mockedExecFile).toHaveBeenCalledWith(
        'sh',
        ['-c', 'echo hi'],
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should capture stderr', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, '', 'warning: something\n');
        return {} as any;
      });

      const result = await executor.execute({
        code: 'console.warn("warning: something")',
        language: 'javascript',
      });

      expect(result.status).toBe('success');
      expect(result.stderr).toBe('warning: something\n');
    });

    it('should handle execution errors', async () => {
      const error = new Error('syntax error') as NodeJS.ErrnoException;
      error.code = 'ERR_CHILD_PROCESS';

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(error, '', 'SyntaxError: Unexpected token');
        return {} as any;
      });

      const result = await executor.execute({
        code: 'invalid{{{',
        language: 'javascript',
      });

      expect(result.status).toBe('error');
      expect(result.stderr).toBe('SyntaxError: Unexpected token');
    });

    it('should handle timeout errors', async () => {
      const error = new Error('timed out') as NodeJS.ErrnoException;
      (error as any).killed = true;

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(error, '', '');
        return {} as any;
      });

      const result = await executor.execute({
        code: 'while(true){}',
        language: 'javascript',
        timeoutMs: 100,
      });

      expect(result.status).toBe('timeout');
    });

    it('should pass custom env variables', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, opts, callback) => {
        (callback as Function)(null, '', '');
        return {} as any;
      });

      await executor.execute({
        code: 'console.log(process.env.MY_VAR)',
        language: 'javascript',
        env: { MY_VAR: 'test_value' },
      });

      const callOpts = mockedExecFile.mock.calls[0]![2] as any;
      expect(callOpts.env.MY_VAR).toBe('test_value');
    });

    it('should set memory limit via --max-old-space-size', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, '', '');
        return {} as any;
      });

      await executor.execute({
        code: 'console.log(1)',
        language: 'javascript',
        memoryLimitMb: 512,
      });

      const args = mockedExecFile.mock.calls[0]![1] as string[];
      expect(args).toContain('--max-old-space-size=512');
    });
  });

  describe('isLanguageAvailable', () => {
    it('should return true when runtime is available', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'v22.0.0\n', '');
        return {} as any;
      });

      const available = await executor.isLanguageAvailable('javascript');
      expect(available).toBe(true);
    });

    it('should return false when runtime is not available', async () => {
      const error = new Error('not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(error);
        return {} as any;
      });

      const available = await executor.isLanguageAvailable('python');
      expect(available).toBe(false);
    });
  });
});
