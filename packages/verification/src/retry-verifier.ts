import type { VerificationContext, VerificationResult } from './types.js';

/** Structural type — works with any verifier that has verify() */
interface VerifierLike {
  verify(ctx: VerificationContext): VerificationResult;
}

export interface RetryVerifierOptions {
  readonly maxRetries?: number;
}

export interface RetryResult extends VerificationResult {
  readonly attempts: number;
  readonly autoFixed: boolean;
}

export type FixFunction = (ctx: VerificationContext, result: VerificationResult) => Promise<string>;

export class RetryVerifier {
  private verifier: VerifierLike;
  private fixFn: FixFunction;
  private maxRetries: number;

  constructor(verifier: VerifierLike, fixFn: FixFunction, options?: RetryVerifierOptions) {
    this.verifier = verifier;
    this.fixFn = fixFn;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  async verifyWithRetry(ctx: VerificationContext): Promise<RetryResult> {
    let currentCtx = ctx;
    let result = this.verifier.verify(currentCtx);
    let attempts = 1;

    while (!result.passed && attempts <= this.maxRetries) {
      const fixedOutput = await this.fixFn(currentCtx, result);
      currentCtx = { ...currentCtx, output: fixedOutput };
      result = this.verifier.verify(currentCtx);
      attempts++;
    }

    return {
      ...result,
      attempts,
      autoFixed: attempts > 1 && result.passed,
    };
  }
}
