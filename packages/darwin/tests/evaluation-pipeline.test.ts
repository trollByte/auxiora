import { describe, it, expect, vi } from 'vitest';
import { EvaluationPipeline } from '../src/evaluation-pipeline.js';
import { DEFAULT_DARWIN_CONFIG } from '../src/types.js';
import type { Variant, SandboxLike } from '../src/types.js';

function makeSandbox(stdout = '{"score":0.85,"latencyMs":150}'): SandboxLike {
  return {
    createSession: vi.fn().mockResolvedValue({
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout, stderr: '', timedOut: false }),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
    destroySession: vi.fn().mockResolvedValue(true),
  };
}

function makeVariant(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'var_test',
    generation: 0,
    parentIds: [],
    strategy: 'create_new',
    type: 'skill',
    content: 'export default { name: "test", version: "1.0.0", tools: [{ name: "t", description: "d", parameters: {}, run: async () => ({ result: "ok" }) }] };',
    metadata: {},
    metrics: { accuracy: 0, latencyP50: 0, latencyP95: 0, errorRate: 0 },
    securityPassed: false,
    reviewScore: 0,
    status: 'evaluated',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('EvaluationPipeline', () => {
  it('passes valid variant through all stages', async () => {
    const sandbox = makeSandbox();
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(true);
    expect(result.securityPassed).toBe(true);
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.accuracy).toBe(0.85);
    expect(result.metrics!.latencyP50).toBe(150);
    expect(result.metrics!.latencyP95).toBe(225);
    expect(result.reviewScore).toBe(0.8);
    expect(result.reviewApproved).toBe(true);
  });

  it('rejects variant with syntax error (no export)', async () => {
    const pipeline = new EvaluationPipeline({ config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant({ content: 'const x = 1;' }));

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('syntax');
    expect(result.failureReason).toContain('Invalid syntax');
  });

  it('rejects variant with unbalanced braces', async () => {
    const pipeline = new EvaluationPipeline({ config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant({ content: 'export function foo() { {' }));

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('syntax');
  });

  it('rejects variant with security concern (code injection pattern)', async () => {
    const pipeline = new EvaluationPipeline({ config: DEFAULT_DARWIN_CONFIG });
    // The content uses a code injection pattern that should be caught
    const dangerousContent = 'export const fn = new ' + 'Function("return 1");';
    const variant = makeVariant({ content: dangerousContent });
    const result = await pipeline.evaluate(variant);

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('security');
    expect(result.failureReason).toContain('Security pattern matched');
  });

  it('rejects when sandbox times out', async () => {
    const sandbox: SandboxLike = {
      createSession: vi.fn().mockResolvedValue({
        runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: true }),
        stop: vi.fn().mockResolvedValue(undefined),
      }),
      destroySession: vi.fn().mockResolvedValue(true),
    };
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('sandbox');
    expect(result.failureReason).toContain('timed out');
  });

  it('rejects below accuracy threshold', async () => {
    const sandbox = makeSandbox('{"score":0.3,"latencyMs":100}');
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('benchmark');
    expect(result.failureReason).toContain('Accuracy');
  });

  it('rejects above error rate threshold', async () => {
    const sandbox = makeSandbox('{"score":0.9,"latencyMs":100,"errorRate":0.3}');
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('benchmark');
    expect(result.failureReason).toContain('Error rate');
  });

  it('rejects above latency threshold', async () => {
    const sandbox = makeSandbox('{"score":0.9,"latencyMs":15000}');
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('benchmark');
    expect(result.failureReason).toContain('Latency P95');
  });

  it('handles sandbox creation failure gracefully', async () => {
    const sandbox: SandboxLike = {
      createSession: vi.fn().mockRejectedValue(new Error('Container unavailable')),
      destroySession: vi.fn().mockResolvedValue(true),
    };
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant());

    expect(result.passed).toBe(false);
    expect(result.failedStage).toBe('sandbox');
    expect(result.failureReason).toContain('Sandbox creation failed');
  });

  it('skips sandbox for prompt variants', async () => {
    const sandbox = makeSandbox();
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant({ type: 'prompt', content: 'You are a helpful assistant.' }));

    expect(result.passed).toBe(true);
    expect(result.securityPassed).toBe(true);
    expect(result.metrics).toEqual({ accuracy: 1, latencyP50: 0, latencyP95: 0, errorRate: 0 });
    expect(sandbox.createSession).not.toHaveBeenCalled();
  });

  it('skips sandbox for config variants', async () => {
    const sandbox = makeSandbox();
    const pipeline = new EvaluationPipeline({ sandbox, config: DEFAULT_DARWIN_CONFIG });
    const result = await pipeline.evaluate(makeVariant({ type: 'config', content: '{"temperature": 0.7}' }));

    expect(result.passed).toBe(true);
    expect(result.securityPassed).toBe(true);
    expect(result.reviewScore).toBe(0.8);
    expect(sandbox.createSession).not.toHaveBeenCalled();
  });
});
