export interface AutomationTrigger {
  type: 'schedule' | 'event' | 'condition';
  source?: string;
  event?: string;
  schedule?: { cron: string; timezone?: string };
  condition?: string;
}

export interface AutomationAction {
  tool: string;
  params: Record<string, unknown>;
  description: string;
}

export interface AutomationSpec {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
}

export interface ParseResult {
  success: boolean;
  spec?: AutomationSpec;
  error?: string;
  confidence: number;
}

export interface BehaviorConfig {
  type: 'scheduled' | 'monitor' | 'one-shot';
  action: string;
  schedule?: { cron: string; timezone: string };
  polling?: { intervalMs: number; condition: string };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
