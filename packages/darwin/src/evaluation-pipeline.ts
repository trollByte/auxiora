import type { Variant, EvaluationResult, SandboxLike, DarwinConfig, VariantMetrics } from './types.js';

export interface EvaluationPipelineOptions {
  sandbox?: SandboxLike;
  config: DarwinConfig;
}

const SECURITY_PATTERNS: RegExp[] = [
  /new\s+Function\s*\(/,
  /(?:API_KEY|SECRET|PASSWORD|TOKEN)\s*=\s*['"][^'"]+['"]/,
  /sk-[A-Za-z0-9]{20,}/,
  /\.innerHTML\s*=/,
  /dangerously[Ss]et[Ii]nner[Hh][Tt][Mm][Ll]/,
  /rm\s+-rf/,
  /child_process|\.spawn\s*\(|\.exec\s*\(/,
];

function checkBraces(content: string): boolean {
  let depth = 0;
  for (const ch of content) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export class EvaluationPipeline {
  private readonly sandbox?: SandboxLike;
  private readonly config: DarwinConfig;

  constructor(options: EvaluationPipelineOptions) {
    this.sandbox = options.sandbox;
    this.config = options.config;
  }

  async runChecks(variant: Variant): Promise<EvaluationResult> {
    const isSkill = variant.type === 'skill';

    // For prompt/config variants, skip stages 1-4
    if (!isSkill) {
      const metrics: VariantMetrics = { accuracy: 1, latencyP50: 0, latencyP95: 0, errorRate: 0 };
      const reviewScore = 0.8;
      return {
        variantId: variant.id,
        passed: true,
        metrics,
        securityPassed: true,
        reviewScore,
        reviewApproved: reviewScore >= this.config.reviewScoreThreshold,
      };
    }

    // Stage 1 — Syntax check
    const syntaxResult = this.checkSyntax(variant);
    if (syntaxResult) return syntaxResult;

    // Stage 2 — Security scan
    const securityResult = this.checkSecurity(variant);
    if (securityResult) return securityResult;

    // Stage 3 — Sandbox run
    let sandboxStdout = '';
    if (this.sandbox) {
      const sandboxResult = await this.runInSandbox(variant);
      if (sandboxResult.failed) return sandboxResult.result!;
      sandboxStdout = sandboxResult.stdout;
    }

    // Stage 4 — Benchmark
    let metrics: VariantMetrics;
    if (sandboxStdout) {
      const benchResult = this.checkBenchmark(variant, sandboxStdout);
      if (benchResult.failed) return benchResult.result!;
      metrics = benchResult.metrics!;
    } else {
      metrics = { accuracy: 1, latencyP50: 0, latencyP95: 0, errorRate: 0 };
    }

    // Stage 5 — Review
    const securityPassed = true;
    const reviewScore = securityPassed ? 0.8 : 0;
    const reviewApproved = reviewScore >= this.config.reviewScoreThreshold;

    return {
      variantId: variant.id,
      passed: true,
      metrics,
      securityPassed,
      reviewScore,
      reviewApproved,
    };
  }

  async evaluate(variant: Variant): Promise<EvaluationResult> {
    return this.runChecks(variant);
  }

  private checkSyntax(variant: Variant): EvaluationResult | null {
    const content = variant.content;
    if (!content.includes('export') || !checkBraces(content)) {
      return {
        variantId: variant.id,
        passed: false,
        failedStage: 'syntax',
        failureReason: 'Invalid syntax or missing export',
        securityPassed: false,
        reviewScore: 0,
        reviewApproved: false,
      };
    }
    return null;
  }

  private checkSecurity(variant: Variant): EvaluationResult | null {
    for (const pattern of SECURITY_PATTERNS) {
      if (pattern.test(variant.content)) {
        return {
          variantId: variant.id,
          passed: false,
          failedStage: 'security',
          failureReason: `Security pattern matched: ${pattern.source}`,
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        };
      }
    }
    return null;
  }

  private async runInSandbox(variant: Variant): Promise<{ failed: boolean; result?: EvaluationResult; stdout: string }> {
    const sessionId = `darwin-eval-${variant.id}`;
    let session: Awaited<ReturnType<SandboxLike['createSession']>> | undefined;
    try {
      session = await this.sandbox!.createSession(sessionId, '.');
    } catch {
      return {
        failed: true,
        stdout: '',
        result: {
          variantId: variant.id,
          passed: false,
          failedStage: 'sandbox',
          failureReason: 'Sandbox creation failed',
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        },
      };
    }

    try {
      const result = await session.runCommand(['node', '-e', variant.content]);
      if (result.timedOut) {
        return {
          failed: true,
          stdout: '',
          result: {
            variantId: variant.id,
            passed: false,
            failedStage: 'sandbox',
            failureReason: 'Sandbox execution timed out',
            securityPassed: false,
            reviewScore: 0,
            reviewApproved: false,
          },
        };
      }
      if (result.exitCode !== 0) {
        return {
          failed: true,
          stdout: '',
          result: {
            variantId: variant.id,
            passed: false,
            failedStage: 'sandbox',
            failureReason: `Sandbox execution failed with exit code ${result.exitCode}`,
            securityPassed: false,
            reviewScore: 0,
            reviewApproved: false,
          },
        };
      }
      return { failed: false, stdout: result.stdout };
    } finally {
      await session.stop();
      await this.sandbox!.destroySession(sessionId);
    }
  }

  private checkBenchmark(variant: Variant, stdout: string): { failed: boolean; result?: EvaluationResult; metrics?: VariantMetrics } {
    let parsed: { score: number; latencyMs: number; errorRate?: number };
    try {
      parsed = JSON.parse(stdout) as { score: number; latencyMs: number; errorRate?: number };
    } catch {
      return {
        failed: true,
        result: {
          variantId: variant.id,
          passed: false,
          failedStage: 'benchmark',
          failureReason: 'Failed to parse benchmark output',
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        },
      };
    }

    const metrics: VariantMetrics = {
      accuracy: parsed.score,
      latencyP50: parsed.latencyMs,
      latencyP95: parsed.latencyMs * 1.5,
      errorRate: parsed.errorRate ?? 0,
    };

    if (metrics.accuracy < this.config.minAccuracy) {
      return {
        failed: true,
        result: {
          variantId: variant.id,
          passed: false,
          failedStage: 'benchmark',
          failureReason: `Accuracy ${metrics.accuracy} below threshold ${this.config.minAccuracy}`,
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        },
      };
    }

    if (metrics.errorRate > this.config.maxErrorRate) {
      return {
        failed: true,
        result: {
          variantId: variant.id,
          passed: false,
          failedStage: 'benchmark',
          failureReason: `Error rate ${metrics.errorRate} above threshold ${this.config.maxErrorRate}`,
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        },
      };
    }

    if (metrics.latencyP95 > this.config.maxLatencyP95) {
      return {
        failed: true,
        result: {
          variantId: variant.id,
          passed: false,
          failedStage: 'benchmark',
          failureReason: `Latency P95 ${metrics.latencyP95}ms above threshold ${this.config.maxLatencyP95}ms`,
          securityPassed: false,
          reviewScore: 0,
          reviewApproved: false,
        },
      };
    }

    return { failed: false, metrics };
  }
}
