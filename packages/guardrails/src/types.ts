export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ScanTarget = 'input' | 'output';

export interface ScanResult {
  safe: boolean;
  threatLevel: ThreatLevel;
  findings: Finding[];
  sanitized?: string;
}

export interface Finding {
  type: 'pii' | 'injection' | 'toxicity' | 'jailbreak' | 'data_leak';
  description: string;
  severity: ThreatLevel;
  offset?: number;
  length?: number;
  redacted?: string;
}
