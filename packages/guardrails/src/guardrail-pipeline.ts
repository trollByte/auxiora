import { getLogger } from '@auxiora/logger';
import type { GuardrailConfig, ScanResult, Threat, ThreatLevel, GuardrailAction } from './types.js';
import { PiiDetector } from './pii-detector.js';
import { InjectionDetector } from './injection-detector.js';
import { ToxicityFilter } from './toxicity-filter.js';

const logger = getLogger('guardrails:pipeline');

const LEVEL_ORDER: Record<ThreatLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function highestLevel(threats: Threat[]): ThreatLevel {
  let max: ThreatLevel = 'none';
  for (const t of threats) {
    if (LEVEL_ORDER[t.level] > LEVEL_ORDER[max]) {
      max = t.level;
    }
  }
  return max;
}

function determineAction(
  highest: ThreatLevel,
  threshold: ThreatLevel,
  hasPii: boolean,
  redactPii: boolean,
): GuardrailAction {
  if (LEVEL_ORDER[highest] >= LEVEL_ORDER[threshold]) {
    return 'block';
  }
  if (hasPii && redactPii) {
    return 'redact';
  }
  if (highest !== 'none') {
    return 'warn';
  }
  return 'allow';
}

interface ResolvedConfig {
  piiDetection: boolean;
  promptInjection: boolean;
  toxicityFilter: boolean;
  blockThreshold: ThreatLevel;
  redactPii: boolean;
  customPatterns?: GuardrailConfig['customPatterns'];
}

const DEFAULT_CONFIG: ResolvedConfig = {
  piiDetection: true,
  promptInjection: true,
  toxicityFilter: true,
  blockThreshold: 'high',
  redactPii: true,
  customPatterns: undefined,
};

export class GuardrailPipeline {
  private readonly config: ResolvedConfig;
  private readonly piiDetector: PiiDetector;
  private readonly injectionDetector: InjectionDetector;
  private readonly toxicityFilterInstance: ToxicityFilter;

  constructor(config?: GuardrailConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.piiDetector = new PiiDetector();
    this.injectionDetector = new InjectionDetector();
    this.toxicityFilterInstance = new ToxicityFilter();
  }

  scanInput(text: string): ScanResult {
    const threats: Threat[] = [];

    if (this.config.piiDetection) {
      threats.push(...this.piiDetector.detect(text));
    }

    if (this.config.promptInjection) {
      threats.push(...this.injectionDetector.detect(text));
    }

    if (this.config.toxicityFilter) {
      threats.push(...this.toxicityFilterInstance.detect(text));
    }

    if (this.config.customPatterns) {
      threats.push(...this.runCustomPatterns(text));
    }

    return this.buildResult(text, threats);
  }

  scanOutput(text: string): ScanResult {
    const threats: Threat[] = [];

    if (this.config.piiDetection) {
      const piiThreats = this.piiDetector.detect(text);
      for (const t of piiThreats) {
        t.type = 'data_leak';
        t.description = 'Output contains ' + t.description;
      }
      threats.push(...piiThreats);
    }

    if (this.config.customPatterns) {
      threats.push(...this.runCustomPatterns(text));
    }

    return this.buildResult(text, threats);
  }

  private runCustomPatterns(text: string): Threat[] {
    const threats: Threat[] = [];
    if (!this.config.customPatterns) return threats;

    for (const cp of this.config.customPatterns) {
      const regex = new RegExp(cp.pattern.source, cp.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        threats.push({
          type: 'toxicity',
          level: cp.level,
          description: 'Custom pattern match: ' + cp.name,
          location: { start: match.index, end: match.index + match[0].length },
          match: match[0],
        });
      }
    }

    return threats;
  }

  private buildResult(text: string, threats: Threat[]): ScanResult {
    const highest = highestLevel(threats);
    const hasPii = threats.some((t) => t.type === 'pii' || t.type === 'data_leak');
    const action = determineAction(highest, this.config.blockThreshold, hasPii, this.config.redactPii);
    const passed = action === 'allow' || action === 'redact' || action === 'warn';

    const result: ScanResult = {
      passed,
      action,
      threats,
    };

    if ((action === 'redact' || (hasPii && this.config.redactPii)) && this.config.piiDetection) {
      result.redactedContent = this.piiDetector.redact(text);
    }

    logger.debug({ action, threatCount: threats.length, highest }, 'Pipeline scan complete');
    return result;
  }
}
