import { getLogger } from '@auxiora/logger';
import type { AutomationSpec, BehaviorConfig, ValidationResult } from './types.js';

const log = getLogger('nl-automation:automation-builder');

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_POLL_INTERVAL_MS = 300_000; // 5 minutes

export class AutomationBuilder {
  build(spec: AutomationSpec): BehaviorConfig {
    log.debug('Building behavior config', { name: spec.name });

    const actionDescription = spec.actions
      .map((a) => `${a.tool}: ${a.description}`)
      .join('; ');

    switch (spec.trigger.type) {
      case 'schedule': {
        return {
          type: 'scheduled',
          action: actionDescription,
          schedule: {
            cron: spec.trigger.schedule?.cron ?? '0 9 * * *',
            timezone: spec.trigger.schedule?.timezone ?? DEFAULT_TIMEZONE,
          },
        };
      }
      case 'event': {
        return {
          type: 'monitor',
          action: actionDescription,
          polling: {
            intervalMs: DEFAULT_POLL_INTERVAL_MS,
            condition: `${spec.trigger.source}:${spec.trigger.event}`,
          },
        };
      }
      case 'condition': {
        return {
          type: 'monitor',
          action: actionDescription,
          polling: {
            intervalMs: DEFAULT_POLL_INTERVAL_MS,
            condition: spec.trigger.condition ?? '',
          },
        };
      }
    }
  }

  validate(
    spec: AutomationSpec,
    availableTools: string[],
    availableConnectors: string[],
  ): ValidationResult {
    const errors: string[] = [];

    if (!spec.name.trim()) {
      errors.push('Automation name is required');
    }

    if (spec.actions.length === 0) {
      errors.push('At least one action is required');
    }

    for (const action of spec.actions) {
      if (!availableTools.includes(action.tool)) {
        errors.push(`Unknown tool: ${action.tool}`);
      }
    }

    if (spec.trigger.source && !availableConnectors.includes(spec.trigger.source)) {
      errors.push(`Unknown connector: ${spec.trigger.source}`);
    }

    if (spec.trigger.type === 'schedule' && !spec.trigger.schedule?.cron) {
      errors.push('Schedule trigger requires a cron expression');
    }

    if (spec.trigger.type === 'condition' && !spec.trigger.condition) {
      errors.push('Condition trigger requires a condition');
    }

    log.debug('Validation result', { valid: errors.length === 0, errorCount: errors.length });

    return { valid: errors.length === 0, errors };
  }
}
