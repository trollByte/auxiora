/**
 * Tool Loop Detection — sliding-window system with 4 detectors.
 *
 * Detectors:
 *  1. Generic repeat  – same tool+args called N times
 *  2. No-progress     – identical results from repeated calls
 *  3. Ping-pong       – A->B->A->B alternating deadlocks
 *  4. Circuit breaker – global no-progress safety net
 */

import { createHash } from 'node:crypto';

// ── Helpers ─────────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// ── Hashing ─────────────────────────────────────────────────────────

export function hashToolCall(toolName: string, args: unknown): string {
  const payload = toolName + ':' + stableStringify(args);
  return createHash('sha256').update(payload).digest('hex');
}

export function hashOutcome(result: string): string {
  const truncated = result.slice(0, 4096);
  return createHash('sha256').update(truncated).digest('hex');
}

// ── Types ───────────────────────────────────────────────────────────

export interface ToolCallEntry {
  toolName: string;
  argsHash: string;
  toolCallId: string;
  timestamp: number;
  outcomeHash?: string;
}

export interface LoopDetectionConfig {
  windowSize: number;
  genericRepeatWarn: number;
  genericRepeatCritical: number;
  noProgressWarn: number;
  noProgressCritical: number;
  pingPongWarnCycles: number;
  pingPongCriticalCycles: number;
  circuitBreakerLimit: number;
}

export interface LoopDetectionState {
  window: ToolCallEntry[];
  warnedPatterns: Set<string>;
  config: LoopDetectionConfig;
}

export interface LoopDetectionResult {
  severity: 'none' | 'warning' | 'critical';
  detector?: 'generic_repeat' | 'no_progress' | 'ping_pong' | 'circuit_breaker';
  message?: string;
  details?: {
    toolName?: string;
    repeatCount?: number;
    cycleCount?: number;
  };
}

// ── Default Config ──────────────────────────────────────────────────

const DEFAULT_CONFIG: LoopDetectionConfig = {
  windowSize: 30,
  genericRepeatWarn: 5,
  genericRepeatCritical: 10,
  noProgressWarn: 8,
  noProgressCritical: 15,
  pingPongWarnCycles: 3,
  pingPongCriticalCycles: 5,
  circuitBreakerLimit: 20,
};

// ── State Management ────────────────────────────────────────────────

export function createLoopDetectionState(config?: Partial<LoopDetectionConfig>): LoopDetectionState {
  return {
    window: [],
    warnedPatterns: new Set(),
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

export function recordToolCall(
  state: LoopDetectionState,
  toolCallId: string,
  toolName: string,
  args: unknown,
): void {
  state.window.push({
    toolName,
    argsHash: hashToolCall(toolName, args),
    toolCallId,
    timestamp: Date.now(),
  });
  while (state.window.length > state.config.windowSize) {
    state.window.shift();
  }
}

export function recordToolOutcome(
  state: LoopDetectionState,
  toolCallId: string,
  result: string,
): void {
  // findLast — walk backwards for most recent match
  for (let i = state.window.length - 1; i >= 0; i--) {
    if (state.window[i]!.toolCallId === toolCallId) {
      state.window[i]!.outcomeHash = hashOutcome(result);
      return;
    }
  }
}

// ── Detectors ───────────────────────────────────────────────────────

function detectGenericRepeat(state: LoopDetectionState): LoopDetectionResult {
  const { config, window: win, warnedPatterns } = state;
  const counts = new Map<string, { count: number; toolName: string }>();

  for (const entry of win) {
    const existing = counts.get(entry.argsHash);
    if (existing) {
      existing.count++;
    } else {
      counts.set(entry.argsHash, { count: 1, toolName: entry.toolName });
    }
  }

  for (const [hash, { count, toolName }] of counts) {
    if (count >= config.genericRepeatCritical) {
      return {
        severity: 'critical',
        detector: 'generic_repeat',
        message: `Tool "${toolName}" called ${count} times with same args (critical threshold: ${config.genericRepeatCritical})`,
        details: { toolName, repeatCount: count },
      };
    }
    if (count >= config.genericRepeatWarn) {
      const patternKey = `generic:${hash}`;
      if (warnedPatterns.has(patternKey)) {
        continue; // suppress re-warn
      }
      warnedPatterns.add(patternKey);
      return {
        severity: 'warning',
        detector: 'generic_repeat',
        message: `Tool "${toolName}" called ${count} times with same args (warn threshold: ${config.genericRepeatWarn})`,
        details: { toolName, repeatCount: count },
      };
    }
  }

  return { severity: 'none' };
}

function detectNoProgress(state: LoopDetectionState): LoopDetectionResult {
  const { config, window: win, warnedPatterns } = state;

  // Group by argsHash, count entries with matching outcomeHash
  const groups = new Map<string, { outcomes: Map<string, number>; toolName: string }>();

  for (const entry of win) {
    if (entry.outcomeHash === undefined) continue;
    let group = groups.get(entry.argsHash);
    if (!group) {
      group = { outcomes: new Map(), toolName: entry.toolName };
      groups.set(entry.argsHash, group);
    }
    const oc = group.outcomes.get(entry.outcomeHash) ?? 0;
    group.outcomes.set(entry.outcomeHash, oc + 1);
  }

  for (const [argsHash, { outcomes, toolName }] of groups) {
    for (const [, count] of outcomes) {
      if (count >= config.noProgressCritical) {
        return {
          severity: 'critical',
          detector: 'no_progress',
          message: `Tool "${toolName}" returned identical results ${count} times (critical: ${config.noProgressCritical})`,
          details: { toolName, repeatCount: count },
        };
      }
      if (count >= config.noProgressWarn) {
        const patternKey = `no_progress:${argsHash}`;
        if (warnedPatterns.has(patternKey)) {
          continue; // suppress re-warn
        }
        warnedPatterns.add(patternKey);
        return {
          severity: 'warning',
          detector: 'no_progress',
          message: `Tool "${toolName}" returned identical results ${count} times (warn: ${config.noProgressWarn})`,
          details: { toolName, repeatCount: count },
        };
      }
    }
  }

  return { severity: 'none' };
}

function detectPingPong(state: LoopDetectionState): LoopDetectionResult {
  const { config, window: win } = state;
  if (win.length < 4) return { severity: 'none' };

  const hashes = win.map((e) => e.argsHash);

  // Find the longest run of alternating A-B pairs from the tail.
  // A-B-A-B = 2 cycles, A-B-A-B-A-B-A-B = 4 cycles.
  let maxCycles = 0;

  for (let start = hashes.length - 1; start >= 3; start--) {
    const a = hashes[start]!;
    const b = hashes[start - 1]!;
    if (a === b) continue; // need two different hashes

    let cycles = 0;
    let pos = start;
    while (pos >= 1 && hashes[pos] === a && hashes[pos - 1] === b) {
      cycles++;
      pos -= 2;
    }
    if (cycles > maxCycles) maxCycles = cycles;
  }

  if (maxCycles >= config.pingPongCriticalCycles) {
    return {
      severity: 'critical',
      detector: 'ping_pong',
      message: `Ping-pong detected: ${maxCycles} alternating cycles (critical: ${config.pingPongCriticalCycles})`,
      details: { cycleCount: maxCycles },
    };
  }
  if (maxCycles >= config.pingPongWarnCycles) {
    // Build key from the two alternating hashes at the tail
    const hashA = hashes[hashes.length - 1]!;
    const hashB = hashes[hashes.length - 2]!;
    const patternKey = `ping_pong:${hashA}:${hashB}`;
    if (state.warnedPatterns.has(patternKey)) {
      return { severity: 'none' };
    }
    state.warnedPatterns.add(patternKey);
    return {
      severity: 'warning',
      detector: 'ping_pong',
      message: `Ping-pong detected: ${maxCycles} alternating cycles (warn: ${config.pingPongWarnCycles})`,
      details: { cycleCount: maxCycles },
    };
  }

  return { severity: 'none' };
}

function detectCircuitBreaker(state: LoopDetectionState): LoopDetectionResult {
  const { config, window: win } = state;

  // Count entries where argsHash+outcomeHash matches a previous entry
  // First occurrence of each combo is baseline, subsequent are no-progress
  const seen = new Set<string>();
  let noProgressCount = 0;

  for (const entry of win) {
    if (entry.outcomeHash === undefined) continue;
    const key = entry.argsHash + ':' + entry.outcomeHash;
    if (seen.has(key)) {
      noProgressCount++;
    } else {
      seen.add(key);
    }
  }

  if (noProgressCount >= config.circuitBreakerLimit) {
    return {
      severity: 'critical',
      detector: 'circuit_breaker',
      message: `Circuit breaker tripped: ${noProgressCount} no-progress calls (limit: ${config.circuitBreakerLimit})`,
      details: { repeatCount: noProgressCount },
    };
  }

  return { severity: 'none' };
}

// ── Main Entry Point ────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { none: 0, warning: 1, critical: 2 };

export function detectLoop(state: LoopDetectionState): LoopDetectionResult {
  const results: LoopDetectionResult[] = [
    detectCircuitBreaker(state),
    detectNoProgress(state),
    detectPingPong(state),
    detectGenericRepeat(state),
  ];

  let worst: LoopDetectionResult = { severity: 'none' };
  for (const r of results) {
    if ((SEVERITY_RANK[r.severity] ?? 0) > (SEVERITY_RANK[worst.severity] ?? 0)) {
      worst = r;
    }
  }
  return worst;
}
