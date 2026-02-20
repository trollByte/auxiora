import { getLogger } from '@auxiora/logger';
import type { Finding, ScanResult, ThreatLevel } from './types.js';
import { PiiDetector } from './pii-detector.js';
import { InjectionDetector } from './injection-detector.js';
import { OutputFilter } from './output-filter.js';

const logger = getLogger('guardrails:pipeline');
const THREAT_ORDER: ThreatLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

function maxThreatLevel(findings: Finding[]): ThreatLevel {
  let max: ThreatLevel = 'none';
  for (const f of findings) {
    if (THREAT_ORDER.indexOf(f.severity) > THREAT_ORDER.indexOf(max)) max = f.severity;
  }
  return max;
}

export interface GuardrailPipelineOptions {
  enablePii?: boolean;
  enableInjection?: boolean;
  enableOutput?: boolean;
}

export class GuardrailPipeline {
  private readonly piiDetector: PiiDetector;
  private readonly injectionDetector: InjectionDetector;
  private readonly outputFilter: OutputFilter;
  private readonly enablePii: boolean;
  private readonly enableInjection: boolean;
  private readonly enableOutput: boolean;

  constructor(opts?: GuardrailPipelineOptions) {
    this.piiDetector = new PiiDetector();
    this.injectionDetector = new InjectionDetector();
    this.outputFilter = new OutputFilter();
    this.enablePii = opts?.enablePii ?? true;
    this.enableInjection = opts?.enableInjection ?? true;
    this.enableOutput = opts?.enableOutput ?? true;
  }

  scanInput(text: string): ScanResult {
    const findings: Finding[] = [];
    if (this.enablePii) findings.push(...this.piiDetector.scan(text));
    if (this.enableInjection) findings.push(...this.injectionDetector.scan(text));
    const threatLevel = maxThreatLevel(findings);
    const sanitized = this.enablePii ? this.piiDetector.redact(text) : undefined;
    logger.debug('Input scan: %d findings, threat=%s', findings.length, threatLevel);
    return { safe: findings.length === 0, threatLevel, findings, sanitized };
  }

  scanOutput(text: string): ScanResult {
    const findings: Finding[] = [];
    if (this.enablePii) findings.push(...this.piiDetector.scan(text));
    if (this.enableOutput) findings.push(...this.outputFilter.scan(text));
    const threatLevel = maxThreatLevel(findings);
    let sanitized: string | undefined;
    if (this.enablePii || this.enableOutput) {
      sanitized = text;
      if (this.enablePii) sanitized = this.piiDetector.redact(sanitized);
      if (this.enableOutput) sanitized = this.outputFilter.filter(sanitized);
    }
    logger.debug('Output scan: %d findings, threat=%s', findings.length, threatLevel);
    return { safe: findings.length === 0, threatLevel, findings, sanitized };
  }

  isBlocked(result: ScanResult): boolean {
    return result.findings.some(
      (f) => (f.severity === 'critical' || f.severity === 'high') && (f.type === 'injection' || f.type === 'jailbreak'),
    );
  }
}
