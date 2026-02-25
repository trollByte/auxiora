import { describe, it, expect } from 'vitest';
import type { AuditEventType } from '../src/index.js';

describe('Research audit event types', () => {
  it('accepts research.started', () => {
    const event: AuditEventType = 'research.started';
    expect(event).toBe('research.started');
  });

  it('accepts research.completed', () => {
    const event: AuditEventType = 'research.completed';
    expect(event).toBe('research.completed');
  });

  it('accepts research.failed', () => {
    const event: AuditEventType = 'research.failed';
    expect(event).toBe('research.failed');
  });

  it('accepts research.cancelled', () => {
    const event: AuditEventType = 'research.cancelled';
    expect(event).toBe('research.cancelled');
  });
});
