import { describe, it, expect, vi } from 'vitest';

vi.mock('@auxiora/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

import { classifyError } from '../src/process-guard.js';

describe('classifyError', () => {
  it('classifies ECONNRESET as retryable', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies ETIMEDOUT as retryable', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies ENOTFOUND as retryable', () => {
    const err = Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies UND_ERR_CONNECT_TIMEOUT as retryable', () => {
    const err = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies fetch 429 as retryable', () => {
    const err = new Error('Request failed with status 429');
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies SSRFError as retryable', () => {
    const err = new Error('SSRF blocked: private IP');
    err.name = 'SSRFError';
    expect(classifyError(err)).toBe('retryable');
  });

  it('classifies RangeError as fatal', () => {
    const err = new RangeError('Maximum call stack size exceeded');
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies ERR_ASSERTION as fatal', () => {
    const err = Object.assign(new Error('assertion'), { code: 'ERR_ASSERTION' });
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies null property access TypeError as fatal', () => {
    const err = new TypeError("Cannot read properties of null (reading 'foo')");
    expect(classifyError(err)).toBe('fatal');
  });

  it('classifies generic error as unknown', () => {
    const err = new Error('something went wrong');
    expect(classifyError(err)).toBe('unknown');
  });

  it('classifies non-Error values as unknown', () => {
    expect(classifyError('string error')).toBe('unknown');
    expect(classifyError(42)).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
  });
});
