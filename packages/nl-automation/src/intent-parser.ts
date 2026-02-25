import { getLogger } from '@auxiora/logger';
import type { AutomationAction, AutomationTrigger, ParseResult } from './types.js';

const log = getLogger('nl-automation:intent-parser');

interface SchedulePattern {
  regex: RegExp;
  cron: string;
  label: string;
}

const SCHEDULE_PATTERNS: SchedulePattern[] = [
  { regex: /every\s+morning\s+at\s+(\d{1,2})\s*(am|pm)?/i, cron: '', label: 'morning-at' },
  { regex: /every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, cron: '', label: 'daily-at' },
  { regex: /every\s+(\d+)\s+minutes?/i, cron: '', label: 'every-n-min' },
  { regex: /every\s+(\d+)\s+hours?/i, cron: '', label: 'every-n-hour' },
  { regex: /\bhourly\b/i, cron: '0 * * * *', label: 'hourly' },
  { regex: /\bdaily\b/i, cron: '0 9 * * *', label: 'daily' },
  { regex: /every\s+monday/i, cron: '0 9 * * 1', label: 'weekly-mon' },
  { regex: /every\s+tuesday/i, cron: '0 9 * * 2', label: 'weekly-tue' },
  { regex: /every\s+wednesday/i, cron: '0 9 * * 3', label: 'weekly-wed' },
  { regex: /every\s+thursday/i, cron: '0 9 * * 4', label: 'weekly-thu' },
  { regex: /every\s+friday/i, cron: '0 9 * * 5', label: 'weekly-fri' },
  { regex: /every\s+saturday/i, cron: '0 9 * * 6', label: 'weekly-sat' },
  { regex: /every\s+sunday/i, cron: '0 9 * * 0', label: 'weekly-sun' },
  { regex: /\bweekly\b/i, cron: '0 9 * * 1', label: 'weekly' },
];

interface EventPattern {
  regex: RegExp;
  source: string;
  event: string;
}

const EVENT_PATTERNS: EventPattern[] = [
  { regex: /when\s+(?:I\s+)?(?:get|receive)\s+(?:a(?:n)?\s+)?email/i, source: 'google-workspace', event: 'email.received' },
  { regex: /when\s+(?:a\s+)?(?:pull\s+request|PR)\s+is\s+(?:opened|created)/i, source: 'github', event: 'pull_request.opened' },
  { regex: /when\s+(?:a\s+)?(?:pull\s+request|PR)\s+is\s+merged/i, source: 'github', event: 'pull_request.merged' },
  { regex: /when\s+(?:an?\s+)?issue\s+is\s+(?:opened|created)/i, source: 'github', event: 'issue.opened' },
  { regex: /when\s+someone\s+mentions\s+me/i, source: 'slack', event: 'mention' },
  { regex: /when\s+(?:I\s+)?(?:get|receive)\s+(?:a\s+)?(?:slack\s+)?message/i, source: 'slack', event: 'message.received' },
  { regex: /when\s+(?:a\s+)?file\s+is\s+(?:uploaded|added)/i, source: 'google-workspace', event: 'file.uploaded' },
  { regex: /when\s+(?:a\s+)?(?:new\s+)?commit\s+is\s+pushed/i, source: 'github', event: 'push' },
];

interface ActionPattern {
  regex: RegExp;
  tool: string;
  description: string;
}

const ACTION_PATTERNS: ActionPattern[] = [
  { regex: /summarize\s+(?:it|them|the\s+\w+)/i, tool: 'summarize', description: 'Summarize the content' },
  { regex: /send\s+(?:me\s+)?(?:a\s+)?(?:slack\s+)?(?:message|notification)/i, tool: 'send-notification', description: 'Send a notification' },
  { regex: /create\s+(?:a\s+)?task/i, tool: 'create-task', description: 'Create a new task' },
  { regex: /reply\s+(?:with|to)/i, tool: 'reply', description: 'Send a reply' },
  { regex: /(?:give|send)\s+(?:me\s+)?(?:a\s+)?(?:\w+\s+)?briefing/i, tool: 'briefing', description: 'Generate a briefing' },
  { regex: /notify\s+(?:me|us)/i, tool: 'send-notification', description: 'Send a notification' },
  { regex: /(?:check|look\s+at|review)\s+(?:\w+\s+)?(?:pull\s+requests?|PRs?)/i, tool: 'check-prs', description: 'Check pull requests' },
  { regex: /(?:check|look\s+at|review)\s+(?:\w+\s+)?issues?/i, tool: 'check-issues', description: 'Check issues' },
];

function parseTo24Hour(hour: string, minuteStr: string | undefined, meridiem: string | undefined): { hour: number; minute: number } {
  let h = parseInt(hour, 10);
  const m = minuteStr ? parseInt(minuteStr, 10) : 0;
  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === 'pm' && h !== 12) h += 12;
    if (lower === 'am' && h === 12) h = 0;
  }
  return { hour: h, minute: m };
}

function matchSchedule(input: string): AutomationTrigger | undefined {
  for (const pattern of SCHEDULE_PATTERNS) {
    const match = input.match(pattern.regex);
    if (!match) continue;

    let cron = pattern.cron;

    if (pattern.label === 'morning-at') {
      const { hour, minute } = parseTo24Hour(match[1]!, undefined, match[2]);
      cron = `${minute} ${hour} * * *`;
    } else if (pattern.label === 'daily-at') {
      const { hour, minute } = parseTo24Hour(match[1]!, match[2], match[3]);
      cron = `${minute} ${hour} * * *`;
    } else if (pattern.label === 'every-n-min') {
      const n = parseInt(match[1]!, 10);
      cron = `*/${n} * * * *`;
    } else if (pattern.label === 'every-n-hour') {
      const n = parseInt(match[1]!, 10);
      cron = `0 */${n} * * *`;
    }

    return { type: 'schedule', schedule: { cron } };
  }
  return undefined;
}

function matchEvent(input: string): AutomationTrigger | undefined {
  for (const pattern of EVENT_PATTERNS) {
    if (pattern.regex.test(input)) {
      return { type: 'event', source: pattern.source, event: pattern.event };
    }
  }
  return undefined;
}

function matchCondition(input: string): AutomationTrigger | undefined {
  const condMatch = input.match(/(?:check|monitor|watch)\s+(?:if|whether|for)\s+(.+?)(?:\s+and\s+|,|\.|$)/i);
  if (condMatch) {
    return { type: 'condition', condition: condMatch[1]!.trim() };
  }
  return undefined;
}

function matchActions(input: string): AutomationAction[] {
  const actions: AutomationAction[] = [];
  for (const pattern of ACTION_PATTERNS) {
    if (pattern.regex.test(input)) {
      actions.push({
        tool: pattern.tool,
        params: {},
        description: pattern.description,
      });
    }
  }
  return actions;
}

function generateName(input: string): string {
  const words = input.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 6);
  return words.join('-').toLowerCase();
}

export class IntentParser {
  parse(input: string): ParseResult {
    const trimmed = input.trim();
    if (!trimmed) {
      return { success: false, error: 'Empty input', confidence: 0 };
    }

    log.debug('Parsing input', { length: trimmed.length });

    const trigger = matchSchedule(trimmed) ?? matchEvent(trimmed) ?? matchCondition(trimmed);
    const actions = matchActions(trimmed);

    if (!trigger && actions.length === 0) {
      return { success: false, error: 'Could not identify trigger or actions', confidence: 0 };
    }

    let confidence = 0;
    if (trigger) confidence += 0.5;
    if (actions.length > 0) confidence += 0.3;
    if (actions.length > 1) confidence += 0.1;
    if (trigger && actions.length > 0) confidence += 0.1;

    // Without a trigger we can still return a partial result
    if (!trigger) {
      return {
        success: false,
        error: 'Could not identify a trigger',
        confidence,
        spec: {
          name: generateName(trimmed),
          description: trimmed,
          trigger: { type: 'schedule' },
          actions,
          enabled: true,
        },
      };
    }

    return {
      success: true,
      spec: {
        name: generateName(trimmed),
        description: trimmed,
        trigger,
        actions: actions.length > 0 ? actions : [{ tool: 'notify', params: {}, description: 'Notify user' }],
        enabled: true,
      },
      confidence,
    };
  }
}
