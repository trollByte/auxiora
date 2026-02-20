import type { EnrichmentContext, EnrichmentStage, StageResult } from '../types.js';

interface ModeDetectorLike {
  detect(content: string, opts: { currentState: unknown }): { mode: string } | null;
}

interface PromptAssemblerLike {
  enrichForMessage(
    modeState: unknown,
    memorySection: string | null,
    prefs: unknown,
    extra: unknown,
    channelType?: string,
  ): string;
  enrichForSecurityContext(
    secCtx: unknown,
    floor: unknown,
    memorySection: string | null,
  ): string;
}

interface SecurityFloorLike {
  detectSecurityContext(opts: { userMessage: string }): { active: boolean };
}

interface SessionModeStateLike {
  activeMode: string;
  autoDetected: boolean;
  lastAutoMode?: string;
  lastSwitchAt?: number;
  suspendedMode?: string;
}

export interface ModeStageOptions {
  readonly getModeState: (sessionId: string) => SessionModeStateLike;
  readonly detector: ModeDetectorLike;
  readonly assembler: PromptAssemblerLike;
  readonly securityFloor?: SecurityFloorLike;
  readonly userPreferences?: unknown;
}

export class ModeStage implements EnrichmentStage {
  readonly name = 'mode';
  readonly order = 200;

  private readonly getModeState: (sessionId: string) => SessionModeStateLike;
  private readonly detector: ModeDetectorLike;
  private readonly assembler: PromptAssemblerLike;
  private readonly securityFloor?: SecurityFloorLike;
  private readonly userPreferences?: unknown;

  constructor(opts: ModeStageOptions) {
    this.getModeState = opts.getModeState;
    this.detector = opts.detector;
    this.assembler = opts.assembler;
    this.securityFloor = opts.securityFloor;
    this.userPreferences = opts.userPreferences;
  }

  enabled(ctx: EnrichmentContext): boolean {
    return (ctx.config as any).modes?.enabled !== false;
  }

  async enrich(ctx: EnrichmentContext, currentPrompt: string): Promise<StageResult> {
    const modeState = this.getModeState(ctx.sessionId);

    if (this.securityFloor) {
      const securityContext = this.securityFloor.detectSecurityContext({
        userMessage: ctx.userMessage,
      });

      if (securityContext.active) {
        modeState.suspendedMode = modeState.activeMode;
        const prompt = this.assembler.enrichForSecurityContext(
          securityContext,
          this.securityFloor,
          null,
        );
        return { prompt, metadata: { securityFloorActive: true } };
      }

      if (modeState.suspendedMode) {
        modeState.activeMode = modeState.suspendedMode;
        delete modeState.suspendedMode;
        const prompt = this.assembler.enrichForMessage(
          modeState,
          null,
          this.userPreferences,
          undefined,
          ctx.channelType,
        );
        return { prompt, metadata: { modeRestored: true } };
      }
    }

    // Normal mode detection
    return { prompt: this.buildModeEnrichedPrompt(ctx, modeState) };
  }

  private buildModeEnrichedPrompt(
    ctx: EnrichmentContext,
    modeState: SessionModeStateLike,
  ): string {
    if (
      modeState.activeMode === 'auto' &&
      (ctx.config as any).modes?.autoDetection !== false
    ) {
      const detection = this.detector.detect(ctx.userMessage, {
        currentState: modeState,
      });
      if (detection) {
        modeState.lastAutoMode = detection.mode;
        modeState.autoDetected = true;
        modeState.lastSwitchAt = Date.now();
        const tempState: SessionModeStateLike = {
          ...modeState,
          activeMode: detection.mode,
        };
        return this.assembler.enrichForMessage(
          tempState,
          null,
          this.userPreferences,
          undefined,
          ctx.channelType,
        );
      }
    }
    return this.assembler.enrichForMessage(
      modeState,
      null,
      this.userPreferences,
      undefined,
      ctx.channelType,
    );
  }
}
