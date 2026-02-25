export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type GuardrailAction = 'allow' | 'warn' | 'block' | 'redact';

export interface ScanResult {
  passed: boolean;
  action: GuardrailAction;
  threats: Threat[];
  redactedContent?: string;
}

export interface Threat {
  type: 'pii' | 'prompt_injection' | 'toxicity' | 'jailbreak' | 'data_leak';
  level: ThreatLevel;
  description: string;
  location?: { start: number; end: number };
  match?: string;
}

export interface GuardrailConfig {
  piiDetection?: boolean;
  promptInjection?: boolean;
  toxicityFilter?: boolean;
  blockThreshold?: ThreatLevel;
  redactPii?: boolean;
  customPatterns?: Array<{ name: string; pattern: RegExp; level: ThreatLevel }>;
}
