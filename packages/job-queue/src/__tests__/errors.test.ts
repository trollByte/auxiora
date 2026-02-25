import { describe, it, expect } from 'vitest';
import { NonRetryableError } from '../errors.js';

describe('NonRetryableError', () => {
  it('is an instance of Error', () => {
    const err = new NonRetryableError('bad input');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct message', () => {
    const err = new NonRetryableError('validation failed');
    expect(err.message).toBe('validation failed');
  });

  it('has name NonRetryableError', () => {
    const err = new NonRetryableError('x');
    expect(err.name).toBe('NonRetryableError');
  });

  it('can wrap a cause', () => {
    const cause = new Error('root');
    const err = new NonRetryableError('wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});
