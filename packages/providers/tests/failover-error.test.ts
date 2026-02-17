import { describe, it, expect } from 'vitest';
import {
  FailoverError,
  coerceToFailoverError,
  isContextOverflow,
  isUserAbort,
  isTimeoutError,
} from '../src/failover-error.js';
import type { FailoverReason } from '../src/failover-error.js';

describe('FailoverError', () => {
  describe('constructor', () => {
    it('should create error with required fields and no statusCode', () => {
      const err = new FailoverError('rate_limit', 'openai', 'gpt-4', 'Rate limited');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(FailoverError);
      expect(err.name).toBe('FailoverError');
      expect(err.reason).toBe('rate_limit');
      expect(err.provider).toBe('openai');
      expect(err.model).toBe('gpt-4');
      expect(err.message).toBe('Rate limited');
      expect(err.statusCode).toBeUndefined();
    });

    it('should create error with statusCode', () => {
      const err = new FailoverError('billing', 'anthropic', 'claude-3', 'Payment required', 402);
      expect(err.reason).toBe('billing');
      expect(err.statusCode).toBe(402);
      expect(err.provider).toBe('anthropic');
      expect(err.model).toBe('claude-3');
    });
  });

  describe('coerceToFailoverError', () => {
    it('should classify 429 as rate_limit', () => {
      const err = Object.assign(new Error('Too many requests'), { status: 429 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result).toBeInstanceOf(FailoverError);
      expect(result!.reason).toBe('rate_limit');
      expect(result!.statusCode).toBe(429);
    });

    it('should classify 402 as billing', () => {
      const err = Object.assign(new Error('Payment required'), { statusCode: 402 });
      const result = coerceToFailoverError(err, 'anthropic', 'claude-3');
      expect(result!.reason).toBe('billing');
      expect(result!.statusCode).toBe(402);
    });

    it('should classify 401 as auth', () => {
      const err = Object.assign(new Error('Unauthorized'), { status: 401 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('auth');
      expect(result!.statusCode).toBe(401);
    });

    it('should classify 403 as auth', () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      const result = coerceToFailoverError(err, 'google', 'gemini-pro');
      expect(result!.reason).toBe('auth');
      expect(result!.statusCode).toBe(403);
    });

    it('should classify 408 as timeout', () => {
      const err = Object.assign(new Error('Request timeout'), { status: 408 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('timeout');
      expect(result!.statusCode).toBe(408);
    });

    it('should classify 400 with context message as context_overflow', () => {
      const err = Object.assign(
        new Error('This model maximum context length is 8192 tokens, context length exceeded'),
        { status: 400 }
      );
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('context_overflow');
      expect(result!.statusCode).toBe(400);
    });

    it('should classify 400 without context message as format', () => {
      const err = Object.assign(new Error('Invalid request body'), { status: 400 });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('format');
      expect(result!.statusCode).toBe(400);
    });

    it('should classify by error code pattern', () => {
      const err = Object.assign(new Error('Rate limit'), { code: 'rate_limit_exceeded' });
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('rate_limit');
    });

    it('should classify quota message as billing', () => {
      const err = new Error('You have insufficient quota for this request');
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('billing');
    });

    it('should classify timeout message as timeout', () => {
      const err = new Error('Request timed out after 30s');
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result!.reason).toBe('timeout');
    });

    it('should classify token limit message as context_overflow', () => {
      const err = new Error('max_tokens_exceeded: input is too long');
      const result = coerceToFailoverError(err, 'anthropic', 'claude-3');
      expect(result!.reason).toBe('context_overflow');
    });

    it('should return null for unrecognizable errors', () => {
      const err = new Error('Something completely unexpected');
      const result = coerceToFailoverError(err, 'openai', 'gpt-4');
      expect(result).toBeNull();
    });

    it('should handle non-Error input', () => {
      const result = coerceToFailoverError('just a string', 'openai', 'gpt-4');
      expect(result).toBeNull();
    });
  });

  describe('isContextOverflow', () => {
    it('should return true for FailoverError with context_overflow reason', () => {
      const err = new FailoverError('context_overflow', 'openai', 'gpt-4', 'Too long');
      expect(isContextOverflow(err)).toBe(true);
    });

    it('should return false for FailoverError with non-overflow reason', () => {
      const err = new FailoverError('rate_limit', 'openai', 'gpt-4', 'Throttled');
      expect(isContextOverflow(err)).toBe(false);
    });

    it('should return true for plain error with context overflow message', () => {
      const err = new Error('context length exceeded for this model');
      expect(isContextOverflow(err)).toBe(true);
    });

    it('should return false for unrelated error', () => {
      const err = new Error('Network failure');
      expect(isContextOverflow(err)).toBe(false);
    });
  });

  describe('isUserAbort', () => {
    it('should return true for AbortError', () => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      expect(isUserAbort(err)).toBe(true);
    });

    it('should return false for timeout AbortError', () => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      (err as any).cause = new Error('timeout');
      expect(isUserAbort(err)).toBe(false);
    });

    it('should return false for FailoverError', () => {
      const err = new FailoverError('timeout', 'openai', 'gpt-4', 'Timed out');
      err.name = 'AbortError'; // even if name is overridden
      expect(isUserAbort(err)).toBe(false);
    });

    it('should return false for regular error', () => {
      const err = new Error('Something broke');
      expect(isUserAbort(err)).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('should return true for AbortError with timeout cause', () => {
      const cause = new Error('timeout');
      cause.name = 'TimeoutError';
      const err = new DOMException('The operation was aborted', 'AbortError');
      Object.defineProperty(err, 'cause', { value: cause });
      expect(isTimeoutError(err)).toBe(true);
    });

    it('should return true for error with timeout message pattern', () => {
      const err = new Error('ETIMEDOUT: connection timed out');
      expect(isTimeoutError(err)).toBe(true);
    });

    it('should return false for non-timeout error', () => {
      const err = new Error('Connection refused');
      expect(isTimeoutError(err)).toBe(false);
    });
  });
});
