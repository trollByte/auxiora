import { ArchiveStore } from './archive-store.js';
import { MutationEngine } from './mutation-engine.js';
import { EvaluationPipeline } from './evaluation-pipeline.js';
import { ResourceGovernor } from './resource-governor.js';
import { DeploymentManager } from './deployment-manager.js';
import type {
  DarwinConfig,
  LLMCallerLike,
  SandboxLike,
  EventBusLike,
  TelemetryLike,
  PluginLoaderLike,
  Niche,
  NicheComplexity,
  MutationStrategy,
  Variant,
} from './types.js';

export interface DarwinLoopOptions {
  store: ArchiveStore;
  llm: LLMCallerLike;
  sandbox?: SandboxLike;
  eventBus?: EventBusLike;
  telemetry?: TelemetryLike;
  pluginLoader?: PluginLoaderLike;
  darwinDir: string;
  config: DarwinConfig;
  domains: string[];
}

export interface TickResult {
  completed: boolean;
  variantId?: string;
  niche?: Niche;
  strategy?: MutationStrategy;
  archiveUpdated?: boolean;
  deployed?: boolean;
  skippedReason?: string;
  error?: string;
}

export interface LoopStats {
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  archiveOccupancy: number;
  totalVariants: number;
}

const COMPLEXITIES: NicheComplexity[] = ['simple', 'moderate', 'complex'];

export class DarwinLoop {
  private readonly store: ArchiveStore;
  private readonly mutationEngine: MutationEngine;
  private readonly evaluationPipeline: EvaluationPipeline;
  private readonly governor: ResourceGovernor;
  private readonly deploymentManager: DeploymentManager;
  private readonly eventBus?: EventBusLike;
  private readonly telemetry?: TelemetryLike;
  private readonly config: DarwinConfig;
  private readonly domains: string[];

  private totalCycles = 0;
  private successfulCycles = 0;
  private failedCycles = 0;

  constructor(options: DarwinLoopOptions) {
    this.store = options.store;
    this.config = options.config;
    this.domains = options.domains;
    this.eventBus = options.eventBus;
    this.telemetry = options.telemetry;

    this.mutationEngine = new MutationEngine(options.llm);
    this.evaluationPipeline = new EvaluationPipeline({
      sandbox: options.sandbox,
      config: options.config,
    });
    this.governor = new ResourceGovernor({
      tokenBudgetPerHour: options.config.tokenBudgetPerHour,
      maxVariantsPerDay: options.config.maxVariantsPerDay,
      pauseDuringUserActivity: options.config.pauseDuringUserActivity,
    });
    this.deploymentManager = new DeploymentManager({
      darwinDir: options.darwinDir,
      pluginLoader: options.pluginLoader,
      eventBus: options.eventBus,
    });
  }

  async tick(): Promise<TickResult> {
    this.totalCycles++;

    try {
      // Phase 1: Check resource governor
      if (!this.governor.canRunCycle()) {
        this.failedCycles++;
        return { completed: false, skippedReason: 'resource_limit' };
      }

      // Phase 2: OBSERVE — select target niche
      const niche = this.selectTargetNiche();
      const currentCell = this.store.getCell(niche);
      const currentVariant = currentCell ? this.store.getVariant(currentCell.variantId) : null;

      this.eventBus?.publish({
        topic: 'darwin.cycle.start',
        data: { domain: niche.domain, complexity: niche.complexity },
      });

      // Phase 3: PROPOSE — select mutation strategy
      const nearbyVariants = this.getNearbyVariants(niche);
      const strategy = this.mutationEngine.selectStrategy({
        targetNiche: niche,
        currentVariant,
        nearbyVariants,
        weights: this.config.strategyWeights,
      });

      // Phase 4: MUTATE — generate mutation
      const telemetryHints = this.gatherTelemetryHints();
      const mutationResult = await this.mutationEngine.generateMutation({
        strategy,
        targetNiche: niche,
        parent: currentVariant ?? undefined,
        parents: nearbyVariants.length >= 2 ? nearbyVariants.slice(0, 2) : undefined,
        telemetryHints,
      });

      const variantId = `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const variant: Variant = {
        id: variantId,
        generation: currentVariant ? currentVariant.generation + 1 : 1,
        parentIds: mutationResult.parentIds,
        strategy: mutationResult.strategy,
        type: mutationResult.type,
        content: mutationResult.content,
        metadata: mutationResult.metadata,
        metrics: { accuracy: 0, latencyP50: 0, latencyP95: 0, errorRate: 0 },
        securityPassed: false,
        reviewScore: 0,
        status: 'evaluated',
        createdAt: Date.now(),
      };

      this.eventBus?.publish({
        topic: 'darwin.variant.created',
        data: { variantId, strategy, niche: `${niche.domain}/${niche.complexity}` },
      });

      // Phase 5: EVALUATE
      const evalResult = await this.evaluationPipeline.evaluate(variant);

      if (!evalResult.passed) {
        variant.status = 'failed';
        variant.metrics = evalResult.metrics ?? variant.metrics;
        variant.securityPassed = evalResult.securityPassed;
        variant.reviewScore = evalResult.reviewScore;
        this.store.saveVariant(variant);

        this.eventBus?.publish({
          topic: 'darwin.variant.failed',
          data: {
            variantId,
            stage: evalResult.failedStage,
            reason: evalResult.failureReason,
          },
        });

        this.failedCycles++;
        return { completed: false, variantId, niche, strategy, error: evalResult.failureReason };
      }

      // Phase 6: SELECT — update archive
      variant.metrics = evalResult.metrics ?? variant.metrics;
      variant.securityPassed = evalResult.securityPassed;
      variant.reviewScore = evalResult.reviewScore;
      this.store.saveVariant(variant);
      this.governor.recordVariantCreated();

      const benchmarkScore = variant.metrics.accuracy * (1 - variant.metrics.errorRate);
      let archiveUpdated = false;

      if (!currentCell || benchmarkScore > currentCell.benchmarkScore) {
        this.store.setCell(niche, variantId, benchmarkScore);
        archiveUpdated = true;
      }

      this.store.incrementStaleness();

      // Phase 7: DEPLOY
      let deployed = false;
      if (archiveUpdated) {
        const deployResult = await this.deploymentManager.deploy(variant);
        deployed = deployResult.deployed;
      }

      this.successfulCycles++;
      return {
        completed: true,
        variantId,
        niche,
        strategy,
        archiveUpdated,
        deployed,
      };
    } catch (err: unknown) {
      this.failedCycles++;
      const message = err instanceof Error ? err.message : String(err);
      return { completed: false, error: message };
    }
  }

  getGovernor(): ResourceGovernor {
    return this.governor;
  }

  getDeploymentManager(): DeploymentManager {
    return this.deploymentManager;
  }

  getStats(): LoopStats {
    const cells = this.store.getAllCells();
    return {
      totalCycles: this.totalCycles,
      successfulCycles: this.successfulCycles,
      failedCycles: this.failedCycles,
      archiveOccupancy: cells.length,
      totalVariants: cells.length,
    };
  }

  private selectTargetNiche(): Niche {
    // Priority 1: Empty niches
    for (const domain of this.domains) {
      for (const complexity of COMPLEXITIES) {
        const cell = this.store.getCell({ domain, complexity });
        if (!cell) {
          return { domain, complexity };
        }
      }
    }

    // Priority 2: Stale niches
    const staleCells = this.store.getStaleCells(this.config.stalenessThreshold);
    if (staleCells.length > 0) {
      const pick = staleCells[Math.floor(Math.random() * staleCells.length)];
      return pick.niche;
    }

    // Priority 3: Lowest-score occupied niche
    const allCells = this.store.getAllCells();
    if (allCells.length > 0) {
      allCells.sort((a, b) => a.benchmarkScore - b.benchmarkScore);
      return allCells[0].niche;
    }

    // Fallback
    return { domain: this.domains[0] ?? 'general', complexity: 'simple' };
  }

  private getNearbyVariants(niche: Niche): Variant[] {
    const variants: Variant[] = [];
    for (const complexity of COMPLEXITIES) {
      if (complexity === niche.complexity) continue;
      const cell = this.store.getCell({ domain: niche.domain, complexity });
      if (cell) {
        const v = this.store.getVariant(cell.variantId);
        if (v) variants.push(v);
      }
    }
    return variants;
  }

  private gatherTelemetryHints(): string[] {
    if (!this.telemetry) return [];
    const flagged = this.telemetry.getFlaggedTools(0.7, 5);
    return flagged.map(
      (f) => `Tool "${f.tool}" has ${(f.successRate * 100).toFixed(0)}% success rate (${f.totalCalls} calls)`,
    );
  }
}
