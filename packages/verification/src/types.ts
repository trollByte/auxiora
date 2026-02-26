export interface VerificationContext {
  readonly jobId: string;
  readonly jobType: string;
  readonly output: string;
  readonly durationMs: number;
  readonly filesChanged?: string[];
}

export interface VerificationResult {
  readonly jobId: string;
  readonly passed: boolean;
  readonly securityConcerns: string[];
  readonly logicErrors: string[];
  readonly warnings: string[];
  readonly verifiedAt: number;
}
