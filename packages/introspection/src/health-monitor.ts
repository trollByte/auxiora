import { getLogger } from '@auxiora/logger';
import type {
  AutoFixActions,
  HealthIssue,
  HealthState,
  IntrospectionSources,
  SubsystemHealth,
} from './types.js';

const log = getLogger('health-monitor');

let issueCounter = 0;

function nextIssueId(): string {
  return `issue-${++issueCounter}`;
}

export class HealthMonitorImpl {
  private sources: IntrospectionSources;
  private actions: AutoFixActions;
  private state: HealthState;
  private listeners: Array<(state: HealthState) => void> = [];
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(sources: IntrospectionSources, actions?: AutoFixActions) {
    this.sources = sources;
    this.actions = actions ?? {};
    this.state = {
      overall: 'healthy',
      subsystems: [],
      issues: [],
      lastCheck: new Date().toISOString(),
    };
  }

  async check(): Promise<void> {
    const issues: HealthIssue[] = [];
    const subsystems: SubsystemHealth[] = [];
    const now = new Date().toISOString();

    // --- Channel checks ---
    const connected = new Set(this.sources.getConnectedChannels());
    const configured = this.sources.getConfiguredChannels();
    const disconnected = configured.filter((ch) => !connected.has(ch));

    if (disconnected.length > 0) {
      for (const ch of disconnected) {
        issues.push({
          id: nextIssueId(),
          subsystem: 'channels',
          severity: 'warning',
          description: `Channel ${ch} is configured but not connected`,
          detectedAt: now,
          suggestedFix: `Reconnect channel ${ch}`,
          autoFixable: true,
          trustLevelRequired: 2,
        });
      }
      subsystems.push({ name: 'channels', status: 'degraded', lastCheck: now });
    } else {
      subsystems.push({ name: 'channels', status: 'healthy', lastCheck: now });
    }

    // --- Provider checks ---
    const primaryName = this.sources.getPrimaryProviderName();
    const fallbackName = this.sources.getFallbackProviderName();
    let primaryAvailable = true;

    if (this.sources.checkProviderAvailable) {
      primaryAvailable = await this.sources.checkProviderAvailable(primaryName);
    }

    if (!primaryAvailable) {
      if (fallbackName) {
        issues.push({
          id: nextIssueId(),
          subsystem: 'providers',
          severity: 'warning',
          description: `Primary provider ${primaryName} is unavailable; fallback ${fallbackName} exists`,
          detectedAt: now,
          suggestedFix: 'Switch to fallback provider',
          autoFixable: true,
          trustLevelRequired: 3,
        });
        subsystems.push({ name: 'providers', status: 'degraded', lastCheck: now });
      } else {
        issues.push({
          id: nextIssueId(),
          subsystem: 'providers',
          severity: 'critical',
          description: `Primary provider ${primaryName} is unavailable with no fallback`,
          detectedAt: now,
          suggestedFix: 'Configure a fallback provider',
          autoFixable: false,
          trustLevelRequired: 3,
        });
        subsystems.push({ name: 'providers', status: 'unhealthy', lastCheck: now });
      }
    } else {
      subsystems.push({ name: 'providers', status: 'healthy', lastCheck: now });
    }

    // --- Behavior checks ---
    const behaviors = await this.sources.getBehaviors();
    const failingBehaviors = behaviors.filter(
      (b) => b.status === 'active' && b.failCount >= b.maxFailures,
    );

    if (failingBehaviors.length > 0) {
      for (const b of failingBehaviors) {
        issues.push({
          id: nextIssueId(),
          subsystem: 'behaviors',
          severity: 'warning',
          description: `Behavior ${b.id} has reached max failures (${b.failCount}/${b.maxFailures})`,
          detectedAt: now,
          suggestedFix: `Restart behavior ${b.id}`,
          autoFixable: true,
          trustLevelRequired: 2,
        });
      }
      subsystems.push({ name: 'behaviors', status: 'degraded', lastCheck: now });
    } else {
      subsystems.push({ name: 'behaviors', status: 'healthy', lastCheck: now });
    }

    // --- Determine overall health ---
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasWarning = issues.some((i) => i.severity === 'warning');
    const overall: HealthState['overall'] = hasCritical
      ? 'unhealthy'
      : hasWarning
        ? 'degraded'
        : 'healthy';

    // --- Attempt auto-fixes ---
    for (const issue of issues) {
      if (!issue.autoFixable || issue.trustLevelRequired === undefined) continue;

      const trustLevel = this.sources.getTrustLevel
        ? this.sources.getTrustLevel(issue.subsystem)
        : 0;

      if (trustLevel < issue.trustLevelRequired) {
        log.debug(`Skipping auto-fix for ${issue.description}: trust level ${trustLevel} < ${issue.trustLevelRequired}`);
        continue;
      }

      let fixed = false;

      try {
        if (issue.subsystem === 'channels' && this.actions.reconnectChannel) {
          const channelName = issue.description.match(/Channel (\S+)/)?.[1];
          if (channelName) {
            fixed = await this.actions.reconnectChannel(channelName);
          }
        } else if (issue.subsystem === 'providers' && this.actions.switchToFallbackProvider) {
          fixed = await this.actions.switchToFallbackProvider();
        } else if (issue.subsystem === 'behaviors' && this.actions.restartBehavior) {
          const behaviorId = issue.description.match(/Behavior (\S+)/)?.[1];
          if (behaviorId) {
            fixed = await this.actions.restartBehavior(behaviorId);
          }
        }
      } catch (err) {
        log.error(`Auto-fix failed for ${issue.description}: ${err}`);
      }

      if (fixed) {
        issue.resolvedAt = new Date().toISOString();
        log.info(`Auto-fix succeeded for: ${issue.description}`);
      }
    }

    // --- Update state and notify ---
    this.state = { overall, subsystems, issues, lastCheck: now };

    for (const cb of this.listeners) {
      cb(this.getHealthState());
    }
  }

  getHealthState(): HealthState {
    return { ...this.state, subsystems: [...this.state.subsystems], issues: [...this.state.issues] };
  }

  onChange(cb: (state: HealthState) => void): void {
    this.listeners.push(cb);
  }

  start(intervalMs = 30_000): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.check();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
