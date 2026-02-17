import { describe, it, expect } from 'vitest';
import {
  hashToolCall,
  hashOutcome,
  createLoopDetectionState,
  recordToolCall,
  recordToolOutcome,
  detectLoop,
} from '../src/tool-loop-detection.js';

describe('Tool Loop Detection', () => {
  // ── Hashing ───────────────────────────────────────────────────────

  describe('hashToolCall', () => {
    it('should produce deterministic hash for same tool+args', () => {
      const h1 = hashToolCall('read_file', { path: '/etc/hosts' });
      const h2 = hashToolCall('read_file', { path: '/etc/hosts' });
      expect(h1).toBe(h2);
    });

    it('should produce same hash regardless of key order', () => {
      const h1 = hashToolCall('search', { query: 'foo', limit: 10 });
      const h2 = hashToolCall('search', { limit: 10, query: 'foo' });
      expect(h1).toBe(h2);
    });

    it('should produce different hash for different args', () => {
      const h1 = hashToolCall('read_file', { path: '/a' });
      const h2 = hashToolCall('read_file', { path: '/b' });
      expect(h1).not.toBe(h2);
    });

    it('should produce different hash for different tool names', () => {
      const h1 = hashToolCall('read_file', { path: '/a' });
      const h2 = hashToolCall('write_file', { path: '/a' });
      expect(h1).not.toBe(h2);
    });

    it('should handle nested objects with stable sorting', () => {
      const h1 = hashToolCall('t', { outer: { b: 2, a: 1 } });
      const h2 = hashToolCall('t', { outer: { a: 1, b: 2 } });
      expect(h1).toBe(h2);
    });

    it('should handle null, undefined, and empty args', () => {
      const hNull = hashToolCall('t', null);
      const hUndef = hashToolCall('t', undefined);
      const hEmpty = hashToolCall('t', {});
      // All are valid hashes (64 hex chars for SHA-256)
      for (const h of [hNull, hUndef, hEmpty]) {
        expect(h).toMatch(/^[0-9a-f]{64}$/);
      }
      // null and undefined both serialise to "null"
      expect(hNull).toBe(hUndef);
      // empty object is different from null
      expect(hEmpty).not.toBe(hNull);
    });

    it('should produce deterministic outcome hash', () => {
      const h1 = hashOutcome('result text');
      const h2 = hashOutcome('result text');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should truncate long outcomes before hashing', () => {
      const long1 = 'x'.repeat(10_000);
      const long2 = 'x'.repeat(10_000) + 'extra';
      // Both share the first 4096 chars, so hashes should match
      const h1 = hashOutcome(long1);
      const h2 = hashOutcome(long2);
      expect(h1).toBe(h2);
    });
  });

  // ── State & Recording ─────────────────────────────────────────────

  describe('State & Recording', () => {
    it('should create state with default config (windowSize=30)', () => {
      const state = createLoopDetectionState();
      expect(state.config.windowSize).toBe(30);
      expect(state.window).toEqual([]);
      expect(state.warnedPatterns.size).toBe(0);
    });

    it('should create state with custom config (partial override)', () => {
      const state = createLoopDetectionState({ windowSize: 50, genericRepeatWarn: 3 });
      expect(state.config.windowSize).toBe(50);
      expect(state.config.genericRepeatWarn).toBe(3);
      // Non-overridden defaults are preserved
      expect(state.config.genericRepeatCritical).toBe(10);
    });

    it('should record tool calls into sliding window', () => {
      const state = createLoopDetectionState();
      recordToolCall(state, 'tc-1', 'read_file', { path: '/a' });
      recordToolCall(state, 'tc-2', 'read_file', { path: '/b' });
      expect(state.window).toHaveLength(2);
      expect(state.window[0]!.toolCallId).toBe('tc-1');
      expect(state.window[1]!.toolCallId).toBe('tc-2');
    });

    it('should evict oldest entries when window full', () => {
      const state = createLoopDetectionState({ windowSize: 3 });
      recordToolCall(state, 'tc-1', 'a', {});
      recordToolCall(state, 'tc-2', 'b', {});
      recordToolCall(state, 'tc-3', 'c', {});
      recordToolCall(state, 'tc-4', 'd', {});
      expect(state.window).toHaveLength(3);
      expect(state.window[0]!.toolCallId).toBe('tc-2');
    });

    it('should record outcome hash matched by toolCallId', () => {
      const state = createLoopDetectionState();
      recordToolCall(state, 'tc-1', 'read_file', { path: '/a' });
      recordToolOutcome(state, 'tc-1', 'file contents');
      expect(state.window[0]!.outcomeHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should ignore outcome for unknown toolCallId', () => {
      const state = createLoopDetectionState();
      recordToolCall(state, 'tc-1', 'read_file', { path: '/a' });
      // Should not throw
      recordToolOutcome(state, 'tc-unknown', 'whatever');
      expect(state.window[0]!.outcomeHash).toBeUndefined();
    });
  });

  // ── Generic Repeat Detector ───────────────────────────────────────

  describe('Generic Repeat Detector', () => {
    it('should return none when no loops', () => {
      const state = createLoopDetectionState();
      recordToolCall(state, 'tc-1', 'a', { x: 1 });
      recordToolCall(state, 'tc-2', 'b', { x: 2 });
      const result = detectLoop(state);
      expect(result.severity).toBe('none');
    });

    it('should warn at genericRepeatWarn threshold', () => {
      const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('warning');
      expect(result.detector).toBe('generic_repeat');
    });

    it('should critical at genericRepeatCritical threshold', () => {
      const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
      for (let i = 0; i < 6; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('generic_repeat');
    });

    it('should not re-warn for same pattern (warnedPatterns suppression)', () => {
      const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 10 });
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
      }
      // First detection warns
      const r1 = detectLoop(state);
      expect(r1.severity).toBe('warning');
      // Adding one more call (still below critical) — suppress re-warn
      recordToolCall(state, 'tc-extra', 'read_file', { path: '/same' });
      const r2 = detectLoop(state);
      // The generic repeat would warn again but warnedPatterns suppresses it
      expect(r2.severity).toBe('none');
    });

    it('should still escalate to critical even after warning suppressed', () => {
      const state = createLoopDetectionState({ genericRepeatWarn: 3, genericRepeatCritical: 6 });
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
      }
      detectLoop(state); // warn → suppressed
      for (let i = 3; i < 6; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('generic_repeat');
    });
  });

  // ── No-Progress Detector ──────────────────────────────────────────

  describe('No-Progress Detector', () => {
    it('should return none when outcomes differ', () => {
      const state = createLoopDetectionState({ noProgressWarn: 3, noProgressCritical: 6 });
      for (let i = 0; i < 5; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
        recordToolOutcome(state, `tc-${i}`, `different-result-${i}`);
      }
      const result = detectLoop(state);
      // generic repeat may fire, but no_progress should not
      expect(result.detector).not.toBe('no_progress');
    });

    it('should warn when same outcome repeats noProgressWarn times', () => {
      const state = createLoopDetectionState({
        noProgressWarn: 3,
        noProgressCritical: 6,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
        recordToolOutcome(state, `tc-${i}`, 'identical output');
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('warning');
      expect(result.detector).toBe('no_progress');
    });

    it('should critical at noProgressCritical', () => {
      const state = createLoopDetectionState({
        noProgressWarn: 3,
        noProgressCritical: 6,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      for (let i = 0; i < 6; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
        recordToolOutcome(state, `tc-${i}`, 'identical output');
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('no_progress');
    });

    it('should not re-warn for the same no-progress pattern after first warning', () => {
      const state = createLoopDetectionState({
        noProgressWarn: 3,
        noProgressCritical: 10,
        genericRepeatWarn: 100,
        genericRepeatCritical: 100,
      });
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `c${i}`, 'check_status', { id: '123' });
        recordToolOutcome(state, `c${i}`, 'status: pending');
      }
      const first = detectLoop(state);
      expect(first.severity).toBe('warning');
      expect(first.detector).toBe('no_progress');
      // Add one more and re-detect — should suppress
      recordToolCall(state, 'c4', 'check_status', { id: '123' });
      recordToolOutcome(state, 'c4', 'status: pending');
      const second = detectLoop(state);
      expect(second.severity).toBe('none');
    });

    it('should not count calls without outcomes', () => {
      const state = createLoopDetectionState({
        noProgressWarn: 3,
        noProgressCritical: 6,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      for (let i = 0; i < 5; i++) {
        recordToolCall(state, `tc-${i}`, 'read_file', { path: '/same' });
        // No outcome recorded
      }
      const result = detectLoop(state);
      expect(result.detector).not.toBe('no_progress');
    });
  });

  // ── Ping-Pong Detector ────────────────────────────────────────────

  describe('Ping-Pong Detector', () => {
    it('should return none for non-alternating patterns', () => {
      const state = createLoopDetectionState({ pingPongWarnCycles: 2, pingPongCriticalCycles: 4 });
      recordToolCall(state, 'tc-1', 'a', { x: 1 });
      recordToolCall(state, 'tc-2', 'b', { x: 2 });
      recordToolCall(state, 'tc-3', 'c', { x: 3 });
      const result = detectLoop(state);
      expect(result.detector).not.toBe('ping_pong');
    });

    it('should warn on A-B-A-B alternating pattern (2 cycles)', () => {
      const state = createLoopDetectionState({
        pingPongWarnCycles: 2,
        pingPongCriticalCycles: 4,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      // 2 cycles = A B A B (4 entries, 2 complete A-B cycles)
      for (let i = 0; i < 4; i++) {
        const tool = i % 2 === 0 ? 'tool_a' : 'tool_b';
        const args = i % 2 === 0 ? { x: 'a' } : { x: 'b' };
        recordToolCall(state, `tc-${i}`, tool, args);
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('warning');
      expect(result.detector).toBe('ping_pong');
    });

    it('should critical on enough cycles (4 cycles)', () => {
      const state = createLoopDetectionState({
        pingPongWarnCycles: 2,
        pingPongCriticalCycles: 4,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      // 4 cycles = A B A B A B A B (8 entries)
      for (let i = 0; i < 8; i++) {
        const tool = i % 2 === 0 ? 'tool_a' : 'tool_b';
        const args = i % 2 === 0 ? { x: 'a' } : { x: 'b' };
        recordToolCall(state, `tc-${i}`, tool, args);
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('ping_pong');
    });

    it('should not re-warn for the same ping-pong pattern after first warning', () => {
      const state = createLoopDetectionState({
        pingPongWarnCycles: 2,
        pingPongCriticalCycles: 10,
        genericRepeatWarn: 100,
        genericRepeatCritical: 100,
      });
      // 2 cycles
      recordToolCall(state, 'c1', 'bash', { command: 'ls' });
      recordToolCall(state, 'c2', 'web_search', { query: 'fix' });
      recordToolCall(state, 'c3', 'bash', { command: 'ls' });
      recordToolCall(state, 'c4', 'web_search', { query: 'fix' });
      const first = detectLoop(state);
      expect(first.severity).toBe('warning');
      expect(first.detector).toBe('ping_pong');
      // Add one more cycle and re-detect — should suppress
      recordToolCall(state, 'c5', 'bash', { command: 'ls' });
      recordToolCall(state, 'c6', 'web_search', { query: 'fix' });
      const second = detectLoop(state);
      expect(second.severity).toBe('none');
    });

    it('should still escalate ping-pong to critical after warning suppressed', () => {
      const state = createLoopDetectionState({
        pingPongWarnCycles: 2,
        pingPongCriticalCycles: 4,
        genericRepeatWarn: 100,
        genericRepeatCritical: 100,
      });
      // 2 cycles → warning
      for (let i = 0; i < 4; i++) {
        const tool = i % 2 === 0 ? 'tool_a' : 'tool_b';
        const args = i % 2 === 0 ? { x: 'a' } : { x: 'b' };
        recordToolCall(state, `c${i}`, tool, args);
      }
      const first = detectLoop(state);
      expect(first.severity).toBe('warning');
      // Add enough to reach critical (4 cycles total = 8 entries)
      for (let i = 4; i < 8; i++) {
        const tool = i % 2 === 0 ? 'tool_a' : 'tool_b';
        const args = i % 2 === 0 ? { x: 'a' } : { x: 'b' };
        recordToolCall(state, `c${i}`, tool, args);
      }
      const second = detectLoop(state);
      expect(second.severity).toBe('critical');
      expect(second.detector).toBe('ping_pong');
    });

    it('should not trigger on interleaved non-alternating (A-B-C-A)', () => {
      const state = createLoopDetectionState({ pingPongWarnCycles: 2, pingPongCriticalCycles: 4 });
      recordToolCall(state, 'tc-1', 'a', { v: 1 });
      recordToolCall(state, 'tc-2', 'b', { v: 2 });
      recordToolCall(state, 'tc-3', 'c', { v: 3 });
      recordToolCall(state, 'tc-4', 'a', { v: 1 });
      const result = detectLoop(state);
      expect(result.detector).not.toBe('ping_pong');
    });
  });

  // ── Circuit Breaker ───────────────────────────────────────────────

  describe('Circuit Breaker', () => {
    it('should not trigger when outcomes differ', () => {
      const state = createLoopDetectionState({
        circuitBreakerLimit: 5,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
      });
      for (let i = 0; i < 10; i++) {
        recordToolCall(state, `tc-${i}`, 'tool_a', { x: 1 });
        recordToolOutcome(state, `tc-${i}`, `unique-result-${i}`);
      }
      const result = detectLoop(state);
      expect(result.detector).not.toBe('circuit_breaker');
    });

    it('should critical when no-progress calls exceed limit across tools', () => {
      const state = createLoopDetectionState({
        circuitBreakerLimit: 4,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
        noProgressWarn: 99,
        noProgressCritical: 99,
      });
      // Mix of tools, but all repeat with same outcome
      // tool_a x4 (3 duplicates) + tool_b x4 (3 duplicates) = 6 no-progress > limit 4
      for (let i = 0; i < 8; i++) {
        const tool = i % 2 === 0 ? 'tool_a' : 'tool_b';
        recordToolCall(state, `tc-${i}`, tool, { shared: true });
        recordToolOutcome(state, `tc-${i}`, 'same result');
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('circuit_breaker');
    });

    it('should always be active, cannot be bypassed by warnedPatterns', () => {
      const state = createLoopDetectionState({
        circuitBreakerLimit: 4,
        genericRepeatWarn: 99,
        genericRepeatCritical: 99,
        noProgressWarn: 99,
        noProgressCritical: 99,
      });
      // Pretend some patterns are already warned
      state.warnedPatterns.add('some-pattern');
      for (let i = 0; i < 5; i++) {
        recordToolCall(state, `tc-${i}`, 'tool_x', { z: 1 });
        recordToolOutcome(state, `tc-${i}`, 'stuck output');
      }
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('circuit_breaker');
    });
  });

  // ── Integration Flow ─────────────────────────────────────────────

  describe('Integration Flow', () => {
    it('should detect a full stuck loop scenario', () => {
      const state = createLoopDetectionState({
        genericRepeatWarn: 3,
        genericRepeatCritical: 6,
      });

      // Simulate a stuck loop: bash ls called 6 times with identical results
      for (let i = 0; i < 6; i++) {
        recordToolCall(state, `call-${i}`, 'bash', { command: 'ls /nonexistent' });
        recordToolOutcome(state, `call-${i}`, 'Error: No such file or directory');
      }

      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.message).toContain('bash');
      expect(result.message).toContain('6');
    });

    it('should handle mixed productive and stuck calls', () => {
      const state = createLoopDetectionState({
        genericRepeatWarn: 4,
        genericRepeatCritical: 8,
        noProgressWarn: 3,
        noProgressCritical: 5,
      });

      // Some productive calls
      recordToolCall(state, 'c1', 'bash', { command: 'ls' });
      recordToolOutcome(state, 'c1', 'file1.txt');
      recordToolCall(state, 'c2', 'bash', { command: 'cat file1.txt' });
      recordToolOutcome(state, 'c2', 'contents');

      // Now gets stuck polling
      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `poll-${i}`, 'check_status', { id: '123' });
        recordToolOutcome(state, `poll-${i}`, 'status: pending');
      }

      const result = detectLoop(state);
      expect(result.severity).toBe('warning');
      expect(result.detector).toBe('no_progress');
    });

    it('should detect ping-pong between two tools', () => {
      const state = createLoopDetectionState({
        pingPongWarnCycles: 2,
        pingPongCriticalCycles: 3,
        genericRepeatWarn: 100,
        genericRepeatCritical: 100,
      });

      for (let i = 0; i < 3; i++) {
        recordToolCall(state, `read-${i}`, 'read_file', { path: '/app/config.json' });
        recordToolOutcome(state, `read-${i}`, '{"key": "value"}');
        recordToolCall(state, `write-${i}`, 'write_file', { path: '/app/config.json', content: '{"key": "new"}' });
        recordToolOutcome(state, `write-${i}`, 'Success');
      }

      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('ping_pong');
    });

    it('circuit breaker catches diverse no-progress across tools', () => {
      const state = createLoopDetectionState({
        circuitBreakerLimit: 6,
        genericRepeatWarn: 100,
        genericRepeatCritical: 100,
        noProgressWarn: 100,
        noProgressCritical: 100,
        pingPongWarnCycles: 100,
        pingPongCriticalCycles: 100,
      });

      // Different tools, all stuck
      for (let i = 0; i < 4; i++) {
        recordToolCall(state, `a${i}`, 'tool_a', { x: 1 });
        recordToolOutcome(state, `a${i}`, 'error A');
      }
      for (let i = 0; i < 4; i++) {
        recordToolCall(state, `b${i}`, 'tool_b', { y: 2 });
        recordToolOutcome(state, `b${i}`, 'error B');
      }
      // no-progress: 3 (tool_a repeats) + 3 (tool_b repeats) = 6
      const result = detectLoop(state);
      expect(result.severity).toBe('critical');
      expect(result.detector).toBe('circuit_breaker');
    });
  });
});
