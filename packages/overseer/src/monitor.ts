import type { AgentSnapshot, OverseerAlert, OverseerConfig } from './types.js';

export class OverseerMonitor {
  private readonly config: OverseerConfig;

  constructor(config: OverseerConfig) {
    this.config = config;
  }

  analyze(snapshot: AgentSnapshot): OverseerAlert[] {
    const alerts: OverseerAlert[] = [];
    const now = Date.now();

    const loopAlerts = this.detectLoops(snapshot, now);
    alerts.push(...loopAlerts);

    const stallAlert = this.detectStall(snapshot, now);
    if (stallAlert) {
      alerts.push(stallAlert);
    }

    const budgetAlert = this.detectBudgetExceeded(snapshot, now);
    if (budgetAlert) {
      alerts.push(budgetAlert);
    }

    return alerts;
  }

  private detectLoops(snapshot: AgentSnapshot, now: number): OverseerAlert[] {
    const alerts: OverseerAlert[] = [];
    const { toolCalls } = snapshot;
    const { loopThreshold } = this.config;

    if (toolCalls.length < loopThreshold) {
      return alerts;
    }

    // Detect single-tool repetition: same tool N times consecutively
    const singleToolAlert = this.detectSingleToolRepetition(snapshot, now);
    if (singleToolAlert) {
      alerts.push(singleToolAlert);
    }

    // Detect repeating patterns (e.g. A,B,A,B,A,B)
    const patternAlert = this.detectRepeatingPattern(snapshot, now);
    if (patternAlert) {
      alerts.push(patternAlert);
    }

    return alerts;
  }

  private detectSingleToolRepetition(
    snapshot: AgentSnapshot,
    now: number,
  ): OverseerAlert | undefined {
    const { toolCalls } = snapshot;
    const { loopThreshold } = this.config;

    if (toolCalls.length < loopThreshold) {
      return undefined;
    }

    // Check the last N tool calls for same-tool repetition
    const tail = toolCalls.slice(-loopThreshold);
    const allSame = tail.every((tc) => tc.tool === tail[0]!.tool);

    if (allSame) {
      return {
        type: 'loop_detected',
        agentId: snapshot.agentId,
        message: `Tool "${tail[0]!.tool}" called ${loopThreshold} times consecutively`,
        severity: 'warning',
        detectedAt: now,
      };
    }

    return undefined;
  }

  private detectRepeatingPattern(
    snapshot: AgentSnapshot,
    now: number,
  ): OverseerAlert | undefined {
    const { toolCalls } = snapshot;
    const { loopThreshold } = this.config;
    const tools = toolCalls.map((tc) => tc.tool);

    // Try pattern lengths from 2 up to half the tool call list
    const maxPatternLen = Math.floor(tools.length / 2);

    for (let patternLen = 2; patternLen <= maxPatternLen; patternLen++) {
      const repetitions = this.countPatternRepetitions(tools, patternLen);
      if (repetitions >= loopThreshold) {
        const tailStart = tools.length - patternLen * Math.floor(tools.length / patternLen);
        const pattern = tools.slice(tailStart, tailStart + patternLen).join(',');
        return {
          type: 'loop_detected',
          agentId: snapshot.agentId,
          message: `Repeating pattern [${pattern}] detected ${repetitions} times`,
          severity: 'warning',
          detectedAt: now,
        };
      }
    }

    return undefined;
  }

  private countPatternRepetitions(tools: string[], patternLen: number): number {
    const pattern = tools.slice(-patternLen * Math.floor(tools.length / patternLen));
    if (pattern.length < patternLen * 2) {
      return 0;
    }

    const base = pattern.slice(0, patternLen);
    let count = 0;

    for (let i = 0; i <= pattern.length - patternLen; i += patternLen) {
      const chunk = pattern.slice(i, i + patternLen);
      const matches = chunk.every((t, idx) => t === base[idx]);
      if (matches) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  private detectStall(
    snapshot: AgentSnapshot,
    now: number,
  ): OverseerAlert | undefined {
    const idleMs = now - snapshot.lastActivityAt;

    if (idleMs > this.config.stallTimeoutMs) {
      return {
        type: 'stall_detected',
        agentId: snapshot.agentId,
        message: `Agent idle for ${Math.round(idleMs / 1000)}s (threshold: ${Math.round(this.config.stallTimeoutMs / 1000)}s)`,
        severity: 'critical',
        detectedAt: now,
      };
    }

    return undefined;
  }

  private detectBudgetExceeded(
    snapshot: AgentSnapshot,
    now: number,
  ): OverseerAlert | undefined {
    if (snapshot.tokenUsage > this.config.maxTokenBudget) {
      return {
        type: 'budget_exceeded',
        agentId: snapshot.agentId,
        message: `Token usage ${snapshot.tokenUsage} exceeds budget ${this.config.maxTokenBudget}`,
        severity: 'critical',
        detectedAt: now,
      };
    }

    return undefined;
  }
}
