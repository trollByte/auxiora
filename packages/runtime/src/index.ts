import { Gateway, createModelRegistryRouter, mountOpenAICompatRoutes, mountApprovalRoutes, type ClientConnection, type WsMessage } from '@auxiora/gateway';
import { SessionManager, sanitizeTranscript, type Message } from '@auxiora/sessions';
import { MediaProcessor, detectProviders } from '@auxiora/media';
import { ProviderFactory, type Provider, type StreamChunk, type ProviderMetadata, type ThinkingLevel, readClaudeCliCredentials, isSetupToken, refreshOAuthToken, refreshPKCEOAuthToken, streamWithModelFallback } from '@auxiora/providers';
import { ModelRouter, TaskClassifier, ModelSelector, CostTracker, type RoutingResult } from '@auxiora/router';
import { ChannelManager, DraftStreamLoop, type InboundMessage } from '@auxiora/channels';
import { loadConfig, saveConfig as saveFullConfig, type Config, type AgentIdentity } from '@auxiora/config';
import { Vault, vaultExists } from '@auxiora/vault';
import { audit } from '@auxiora/audit';
import {
  getWorkspacePath,
  getSoulPath,
  getAgentsPath,
  getIdentityPath,
  getUserPath,
  getBehaviorsPath,
  getWebhooksPath,
  getScreenshotsDir,
} from '@auxiora/core';
import { createArchitect, ARCHITECT_BASE_PROMPT, VaultStorageAdapter } from '@auxiora/personality/architect';
import type { TheArchitect, ContextRecommendation, UserModel } from '@auxiora/personality/architect';
import {
  toolRegistry,
  toolExecutor,
  initializeToolExecutor,
  ToolPermission,
  setBrowserManager,
  setWebhookManager,
  setBehaviorManager,
  setProviderFactory,
  setOrchestrationEngine,
  setResearchEngine,
  setClipboardMonitor,
  setAppController,
  setSystemStateMonitor,
  setEmailIntelligence,
  setCalendarIntelligence,
  setContactGraph,
  setContextRecall,
  setComposeEngine,
  setGrammarChecker,
  setLanguageDetector,
  type ExecutionContext,
} from '@auxiora/tools';
import { ResearchEngine, ResearchIntentDetector, DeepResearchOrchestrator, ReportGenerator } from '@auxiora/research';
import type { ResearchJob, ResearchProgressEvent } from '@auxiora/research';
import { OrchestrationEngine } from '@auxiora/orchestrator';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { BehaviorManager, evaluateConditions } from '@auxiora/behaviors';
import { BrowserManager } from '@auxiora/browser';
import { ClipboardMonitor, AppController, SystemStateMonitor } from '@auxiora/os-bridge';
import type { Platform } from '@auxiora/os-bridge';
import { VoiceManager, detectVoiceProviders, createSTTProvider, createTTSProvider } from '@auxiora/voice';
import { WebhookManager } from '@auxiora/webhooks';
import { createDashboardRouter } from '@auxiora/dashboard';
import { PluginLoader, registerCreateSkillTool } from '@auxiora/plugins';
import {
  MemoryStore,
  MemoryRetriever,
  MemoryExtractor,
  PatternDetector,
  PersonalityAdapter,
} from '@auxiora/memory';
import { TrustEngine, ActionAuditTrail, RollbackManager, TrustGate } from '@auxiora/autonomy';
import { IntentParser, ActionPlanner } from '@auxiora/intent';
import { createLoopDetectionState, recordToolCall, recordToolOutcome, detectLoop } from './tool-loop-detection.js';
import { UserManager } from '@auxiora/social';
import { WorkflowEngine, ApprovalManager, AutonomousExecutor } from '@auxiora/workflows';
import { AgentProtocol, MessageSigner, AgentDirectory } from '@auxiora/agent-protocol';
import { Updater, InstallationDetector, VersionChecker, HealthChecker, createStrategyMap } from '@auxiora/updater';
import type { UpdateChannel } from '@auxiora/updater';
import { AmbientPatternEngine, QuietNotificationManager, BriefingGenerator, AnticipationEngine, AmbientScheduler, DEFAULT_AMBIENT_SCHEDULER_CONFIG, NotificationOrchestrator, AmbientAwarenessCollector } from '@auxiora/ambient';
import { NotificationHub, DoNotDisturbManager } from '@auxiora/notification-hub';
import { ConnectorRegistry, AuthManager as ConnectorAuthManager, TriggerManager, type TriggerEvent } from '@auxiora/connectors';
import { googleWorkspaceConnector } from '@auxiora/connector-google-workspace';
import { microsoftConnector } from '@auxiora/connector-microsoft';
import { githubConnector } from '@auxiora/connector-github';
import { linearConnector } from '@auxiora/connector-linear';
import { notionConnector } from '@auxiora/connector-notion';
import { homeAssistantConnector } from '@auxiora/connector-homeassistant';
import { twitterConnector, linkedinConnector, redditConnector, instagramConnector } from '@auxiora/connector-social';
import { spotifyConnector } from '@auxiora/connector-spotify';
import { hueConnector } from '@auxiora/connector-hue';
import { obsidianConnector } from '@auxiora/connector-obsidian';
import { ConversationEngine } from '@auxiora/conversation';
import { EmailTriageEngine, ThreadSummarizer } from '@auxiora/email-intelligence';
import { ScheduleAnalyzer, ScheduleOptimizer, MeetingPrepGenerator } from '@auxiora/calendar-intelligence';
import { ContactGraph, ContextRecall } from '@auxiora/contacts';
import { ComposeEngine, GrammarChecker, LanguageDetector } from '@auxiora/compose';
import { ScreenCapturer, ScreenAnalyzer } from '@auxiora/screen';
import { CapabilityCatalogImpl, HealthMonitorImpl, createIntrospectTool, generatePromptFragment } from '@auxiora/introspection';
import { JobQueue, NonRetryableError } from '@auxiora/job-queue';
import { Consciousness } from '@auxiora/consciousness';
import { McpClientManager } from '@auxiora/mcp';
// import { createMcpServer, StdioServerTransport } from '@auxiora/mcp-server';
import { GuardrailPipeline } from '@auxiora/guardrails';
import { collectTransparencyMeta } from './transparency/index.js';
import type { TransparencyMeta } from './transparency/index.js';
import { IntentParser as NLIntentParser, AutomationBuilder } from '@auxiora/nl-automation';
import { BranchManager } from '@auxiora/conversation-branch';
import { ReActLoop } from '@auxiora/react-loop';
import type { ReActCallbacks, ReActConfig, ReActStep } from '@auxiora/react-loop';
import { AgentCardBuilder, TaskManager as A2ATaskManager, A2AClient } from '@auxiora/a2a';
import type { AgentCard, A2ATask } from '@auxiora/a2a';
import { CanvasSession } from '@auxiora/canvas';
import type { CanvasEventType } from '@auxiora/canvas';
import { WebSocketServer as CanvasWSS, WebSocket as CanvasWS } from 'ws';
import { SandboxManager } from '@auxiora/sandbox';
import type { DockerApi, ExecResult } from '@auxiora/sandbox';
import { DocumentStore, ContextBuilder } from '@auxiora/rag';
import { GraphStore, EntityLinker } from '@auxiora/knowledge-graph';
import type { GraphQuery } from '@auxiora/knowledge-graph';
import { EvalRunner, EvalStore, exactMatch, containsExpected, lengthRatio, keywordCoverage, sentenceCompleteness, responseRelevance, toxicityScore } from '@auxiora/evaluation';
import { CodeExecutor, SessionManager as CodeSessionManager } from '@auxiora/code-interpreter';
import type { Language } from '@auxiora/code-interpreter';
import { ImageGenManager, OpenAIImageProvider, ReplicateImageProvider } from '@auxiora/image-gen';
import type { ImageGenRequest, ImageProvider } from '@auxiora/image-gen';
import type { EvalCase } from '@auxiora/evaluation';
import type { ScanResult } from '@auxiora/guardrails';
import type { SelfModelSnapshot } from '@auxiora/consciousness';
import { BackupManager } from '@auxiora/backup';
import type { BackupResult, DataCategory } from '@auxiora/backup';
import { ApprovalQueue } from '@auxiora/approval-queue';
import { VectorStore } from '@auxiora/vector-store';
import type { IntrospectionSources, AutoFixActions, SelfAwarenessContext } from '@auxiora/introspection';
import type { CaptureBackend, VisionBackend } from '@auxiora/screen';
import type { LivingMemoryState } from '@auxiora/memory';
import { setMemoryStore } from '@auxiora/tools';
import { getAuditLogger } from '@auxiora/audit';
import { Router } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import {
  PersonalityManager,
  ModeLoader,
  ModeDetector,
  PromptAssembler,
  MODE_IDS,
  DEFAULT_SESSION_MODE_STATE,
  SecurityFloor,
  EscalationStateMachine,
  ArchitectBridge,
  ArchitectAwarenessCollector,
  parseSoulBiases,
  type SessionModeState,
  type ModeId,
  type UserPreferences,
  type SecurityContext,
} from '@auxiora/personality';
import { getModesDir } from '@auxiora/core';
import { fileURLToPath } from 'node:url';
import { getLogger, generateRequestId, runWithRequestId } from '@auxiora/logger';
import {
  SelfAwarenessAssembler,
  InMemoryAwarenessStorage,
  ConversationReflector,
  CapacityMonitor,
  KnowledgeBoundary,
  RelationshipModel,
  TemporalTracker,
  EnvironmentSensor,
  MetaCognitor,
} from '@auxiora/self-awareness';
import type { SignalCollector } from '@auxiora/self-awareness';
import { EnrichmentPipeline, MemoryStage, ModeStage, ArchitectStage, SelfAwarenessStage, GroupContextStage, TelemetryStage } from './enrichment/index.js';
import type { EnrichmentContext } from './enrichment/index.js';

export interface AuxioraOptions {
  config?: Config;
  vaultPassword?: string;
  /** PIN for sealed auto-unseal (or set AUXIORA_SEAL_PIN env var) */
  sealPin?: string;
}

/**
 * Map Claude Code emulation tool calls to our actual tool names + input format.
 * The model may call CC tools (WebSearch, Bash, etc.) since they're in the request for OAuth compat.
 */
/**
 * Claude Code internal tools that have no Auxiora equivalent.
 * When the model tries to call these, we return a helpful error message
 * instead of letting them hit the tool executor and waste a round-trip.
 */
const CC_ONLY_TOOLS = new Set([
  'EnterPlanMode', 'ExitPlanMode', 'AskUserQuestion',
  'NotebookEdit', 'Skill', 'Task', 'TaskOutput',
]);

function mapCCToolCall(name: string, input: any): { name: string; input: any; skip?: string } {
  switch (name) {
    case 'WebSearch':
      return { name: 'web_browser', input: { url: `https://www.google.com/search?q=${encodeURIComponent(input.query || '')}` } };
    case 'WebFetch':
      return { name: 'web_browser', input: { url: input.url } };
    case 'Bash':
      return { name: 'bash', input: { command: input.command, timeout: input.timeout } };
    case 'Read':
      return { name: 'file_read', input: { path: input.file_path } };
    case 'Write':
      return { name: 'file_write', input: { path: input.file_path, content: input.content } };
    case 'Edit':
      return { name: 'file_write', input: { path: input.file_path, content: input.new_string } };
    case 'Glob':
      return { name: 'file_list', input: { path: input.path || '.', pattern: input.pattern } };
    case 'Grep':
      return { name: 'bash', input: { command: `grep -r "${(input.pattern || '').replace(/"/g, '\\"')}" ${input.path || '.'} --include="${input.glob || '*'}" -l 2>/dev/null | head -20` } };
    default:
      if (CC_ONLY_TOOLS.has(name)) {
        return { name, input, skip: `Tool "${name}" is not available. Do not use Claude Code internal tools. Respond using text only or use the available tools: bash, web_browser, file_read, file_write, file_list.` };
      }
      return { name, input };
  }
}

const ACTIVITY_EVENT_PREFIXES = [
  'behavior.', 'message.', 'channel.', 'webhook.',
  'system.', 'auth.login', 'auth.logout',
];

export class Auxiora {
  private logger = getLogger('runtime');
  private config!: Config;
  private gateway!: Gateway;
  private sessions!: SessionManager;
  private providers!: ProviderFactory;
  private channels?: ChannelManager;
  private vault!: Vault;
  private systemPrompt: string = '';
  private standardPrompt: string = '';
  private architectPrompt: string = '';
  private running = false;
  private behaviors?: BehaviorManager;
  private browserManager?: BrowserManager;
  private voiceManager?: VoiceManager;
  private webhookManager?: WebhookManager;
  private pluginLoader?: PluginLoader;
  private modelRouter?: ModelRouter;
  private memoryStore?: MemoryStore;
  private memoryRetriever?: MemoryRetriever;
  private memoryExtractor?: MemoryExtractor;
  private patternDetector?: PatternDetector;
  private personalityAdapter?: PersonalityAdapter;
  private mediaProcessor?: MediaProcessor;
  private memoryCleanupInterval?: ReturnType<typeof setInterval>;
  private trustEngine?: TrustEngine;
  private trustAuditTrail?: ActionAuditTrail;
  private rollbackManager?: RollbackManager;
  private trustGate?: TrustGate;
  private intentParser?: IntentParser;
  private actionPlanner?: ActionPlanner;
  private orchestrationEngine?: OrchestrationEngine;
  private jobQueue?: JobQueue;
  private modelRegistry?: import('@auxiora/model-registry').ModelRegistry;
  private modelRefreshTimer?: ReturnType<typeof setInterval>;
  private toolApprovalGate?: import('./tool-approval-gate.js').ToolApprovalGate;
  private auxioraVersion: string = '';
  // Self-improvement telemetry (structural types — no direct @auxiora/telemetry import)
  private telemetryTracker?: { getFlaggedTools(threshold: number, minCalls: number): Array<{ tool: string; totalCalls: number; successRate: number; lastError: string }> };
  private sessionReflector?: { reflect(sessionId: string): { sessionId: string; toolsUsed: number; overallSuccessRate: number; issues: string[]; summary: string }; save(reflection: unknown): void };
  // [P14] Team / Social
  private userManager?: UserManager;
  private workflowEngine?: WorkflowEngine;
  private approvalManager?: ApprovalManager;
  private autonomousExecutor?: AutonomousExecutor;
  private agentProtocol?: AgentProtocol;
  private agentDirectory?: AgentDirectory;
  // [P15] Senses
  private ambientEngine?: AmbientPatternEngine;
  private ambientNotifications?: QuietNotificationManager;
  private briefingGenerator?: BriefingGenerator;
  private anticipationEngine?: AnticipationEngine;
  private conversationEngine?: ConversationEngine;
  private screenCapturer?: ScreenCapturer;
  private screenAnalyzer?: ScreenAnalyzer;
  // Modes system
  private modeLoader?: ModeLoader;
  private modeDetector?: ModeDetector;
  private promptAssembler?: PromptAssembler;
  private sessionModes: Map<string, SessionModeState> = new Map();
  private userPreferences?: UserPreferences;
  // Connector system
  private connectorRegistry?: ConnectorRegistry;
  private connectorAuthManager?: ConnectorAuthManager;
  private triggerManager?: TriggerManager;
  private ambientScheduler?: AmbientScheduler;
  private ambientDetectTimer?: ReturnType<typeof setInterval>;
  private ambientAwarenessCollector?: AmbientAwarenessCollector;
  private notificationHub?: NotificationHub;
  private dndManager?: DoNotDisturbManager;
  private notificationOrchestrator?: NotificationOrchestrator;

  private researchEngine?: ResearchEngine;
  private intentDetector = new ResearchIntentDetector();
  private researchJobs = new Map<string, ResearchJob>();
  private researchJobExpiry?: ReturnType<typeof setInterval>;
  private capabilityCatalog?: CapabilityCatalogImpl;
  private healthMonitor?: HealthMonitorImpl;
  private capabilityPromptFragment: string = '';
  private selfAwarenessAssembler?: SelfAwarenessAssembler;
  private architect?: TheArchitect;
  private architectBridge: ArchitectBridge | null = null;
  private architectResetChats = new Set<string>();
  private architectAwarenessCollector: ArchitectAwarenessCollector | null = null;
  private enrichmentPipeline?: EnrichmentPipeline;
  private lastToolsUsed = new Map<string, Array<{ name: string; success: boolean }>>();
  private consciousness?: Consciousness;
  private mcpClientManager?: McpClientManager;
  private selfModelCache?: { snapshot: SelfModelSnapshot; cachedAt: number };
  private userModelCache?: { model: UserModel; cachedAt: number };
  private static readonly MODEL_CACHE_TTL = 60_000;

  // Security floor
  private securityFloor?: SecurityFloor;
  private guardrailPipeline?: GuardrailPipeline;
  private evalRunner?: EvalRunner;
  private evalStore?: EvalStore;
  private documentStore?: DocumentStore;
  private contextBuilder?: ContextBuilder;
  private knowledgeGraph?: GraphStore;
  private entityLinker?: EntityLinker;
  private imageGenManager?: ImageGenManager;
  private updater?: Updater;
  private installationDetector?: InstallationDetector;
  private versionChecker?: VersionChecker;
  private codeExecutor?: CodeExecutor;
  private codeSessionManager?: CodeSessionManager;
  private backupManager?: BackupManager;
  private backupStore: Map<string, BackupResult> = new Map();
  private nlIntentParser: NLIntentParser = new NLIntentParser();
  private automationBuilder: AutomationBuilder = new AutomationBuilder();
  private branchManagers: Map<string, BranchManager> = new Map();
  private approvalQueue?: ApprovalQueue;
  private vectorStore?: VectorStore;
  private reactLoops: Map<string, ReActLoop> = new Map();
  private reactResults: Map<string, unknown> = new Map();
  private a2aTaskManager: A2ATaskManager = new A2ATaskManager();
  private a2aAgentCard?: AgentCard;
  private canvasSessions: Map<string, CanvasSession> = new Map();
  private sandboxManager?: SandboxManager;
  private sessionEscalation: Map<string, EscalationStateMachine> = new Map();
  /** Tracks the most recent channel ID for each connected channel type (e.g. discord → snowflake).
   *  Used for proactive delivery (behaviors, ambient briefings). Persisted to disk. */
  private lastActiveChannels: Map<string, string> = new Map();
  private activeAgents: Map<string, { id: string; type: string; description: string; channelType?: string; startedAt: string }> = new Map();
  private channelTargetsPath: string = path.join(path.dirname(getBehaviorsPath()), 'channel-targets.json');
  private orchestrationHistory: Array<{
    workflowId: string;
    pattern: string;
    taskCount: number;
    totalCost: number;
    duration: number;
    timestamp: number;
  }> = [];

  async initialize(options: AuxioraOptions = {}): Promise<void> {
    // Read version from package.json
    try {
      const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
      const pkgPath = path.resolve(runtimeDir, '..', 'package.json');
      this.auxioraVersion = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
    } catch { /* version will remain empty */ }

    // Load config
    this.config = options.config || (await loadConfig());

    // Initialize vault (optional)
    this.vault = new Vault();
    if (options.vaultPassword) {
      try {
        await this.vault.unlock(options.vaultPassword);
      } catch (error) {
        this.logger.warn('Failed to unlock vault', { error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    // Try sealed auto-unseal if vault is still locked
    if (!options.vaultPassword) {
      try {
        const { SealManager } = await import('@auxiora/vault');
        const seal = new SealManager();
        if (await seal.isSealed()) {
          const sealPin = options.sealPin || process.env.AUXIORA_SEAL_PIN || undefined;
          if (await seal.autoUnseal(this.vault, sealPin)) {
            this.logger.info('Vault auto-unsealed from seal');
          }
        }
      } catch (error) {
        this.logger.debug('Sealed auto-unseal not available', { error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    // Initialize tool system with approval callback
    initializeToolExecutor(async (toolName: string, params: any, context: ExecutionContext) => {
      // For now, auto-approve all tools in non-interactive mode
      // In future, could send approval request to client via WebSocket
      this.logger.debug('Auto-approving tool', { toolName, params });
      return true;
    });

    // Initialize MCP client connections
    if (this.config.mcp && Object.keys(this.config.mcp.servers).length > 0) {
      try {
        this.mcpClientManager = new McpClientManager(toolRegistry, this.config.mcp);
        await this.mcpClientManager.connectAll();
        const status = this.mcpClientManager.getStatus();
        this.logger.info('MCP client initialized', {
          servers: status.size,
          tools: [...status.values()].reduce((sum, s) => sum + s.toolCount, 0),
        });
      } catch (err) {
        this.logger.warn('Failed to initialize MCP client', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    // MCP server (expose Auxiora as MCP tools) - enabled via config
    // if (config.mcpServer?.enabled) {
    //   const mcpServer = createMcpServer({ memoryStore: this.memoryStore, ... });
    //   const transport = new StdioServerTransport();
    //   await mcpServer.connect(transport);
    // }

    // Initialize sessions
    this.sessions = new SessionManager({
      maxContextTokens: this.config.session.maxContextTokens,
      ttlMinutes: this.config.session.ttlMinutes,
      autoSave: this.config.session.autoSave,
      compactionEnabled: this.config.session.compactionEnabled,
    });
    await this.sessions.initialize();

    // Initialize providers (if vault is unlocked and has keys)
    await this.initializeProviders();

    // Initialize model router (if providers are set up)
    if (this.providers) {
      this.initializeRouter();
      setProviderFactory(this.providers);

      // Inject summarizer for auto-compaction
      this.sessions.setSummarizer(async (prompt: string) => {
        const provider = this.providers!.getPrimaryProvider();
        const result = await provider.complete(
          [{ role: 'user', content: prompt }],
          { maxTokens: 1024 },
        );
        return result.content;
      });
    }

    // Initialize orchestration engine (if enabled and providers available)
    if (this.providers && this.config.orchestration?.enabled !== false) {
      this.orchestrationEngine = new OrchestrationEngine(
        this.providers,
        this.config.orchestration ?? { enabled: true, maxConcurrentAgents: 5, defaultTimeout: 60000, totalTimeout: 300000, allowedPatterns: ['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor'], costMultiplierWarning: 3 },
      );
      setOrchestrationEngine(this.orchestrationEngine);
      this.logger.info('Orchestration engine initialized');
    }

    // Initialize research engine (if Brave API key available)
    if (this.config.research?.enabled !== false) {
      let vaultKey: string | undefined;
      try { vaultKey = this.vault.get('BRAVE_API_KEY'); } catch { /* vault locked */ }
      const braveApiKey = this.config.research?.braveApiKey
        ?? vaultKey
        ?? process.env.AUXIORA_RESEARCH_BRAVE_API_KEY;

      if (braveApiKey) {
        try {
          const provider = this.providers?.getPrimaryProvider();
          const researchEngine = new ResearchEngine({
            braveApiKey,
            provider: provider ?? undefined,
            defaultDepth: this.config.research?.defaultDepth ?? 'standard',
            maxConcurrentSources: this.config.research?.maxConcurrentSources ?? 5,
            searchTimeout: this.config.research?.searchTimeout ?? 10_000,
            fetchTimeout: this.config.research?.fetchTimeout ?? 15_000,
          });
          this.researchEngine = researchEngine;
          setResearchEngine(researchEngine);
          this.logger.info(`Research engine initialized (Brave Search configured${provider ? ', AI extraction enabled' : ''})`);
        } catch (err) {
          this.logger.warn('Failed to initialize research engine', { error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
    }

    // Initialize channels (if configured and vault is unlocked)
    await this.initializeChannels();

    // Load personality files
    await this.loadPersonality();

    // Initialize modes system
    await this.initializeModes();

    // Initialize guardrails pipeline (if enabled)
    if (this.config.guardrails?.enabled !== false) {
      this.guardrailPipeline = new GuardrailPipeline({
        piiDetection: this.config.guardrails?.piiDetection,
        promptInjection: this.config.guardrails?.promptInjection,
        toxicityFilter: this.config.guardrails?.toxicityFilter,
        blockThreshold: this.config.guardrails?.blockThreshold,
        redactPii: this.config.guardrails?.redactPii,
      });
      this.logger.info('Guardrails pipeline initialized');
    }

    // Initialize evaluation system
    this.evalStore = new EvalStore();
    this.evalRunner = new EvalRunner({
      exactMatch,
      containsExpected,
      lengthRatio,
      keywordCoverage,
      sentenceCompleteness,
      responseRelevance,
      toxicityScore,
    });
    this.logger.info('Evaluation system initialized');

    // Initialize backup manager
    this.backupManager = new BackupManager();
    this.logger.info('Backup manager initialized');

    // Initialize approval queue
    this.approvalQueue = new ApprovalQueue();
    this.logger.info('Approval queue initialized');

    // Initialize vector store
    this.vectorStore = new VectorStore({ dimensions: 1536, maxEntries: 100_000 });
    this.logger.info('Vector store initialized');

    // Initialize consciousness orchestrator (self-model, journal, monitor, repair)
    if (this.architect && this.healthMonitor) {
      try {
        this.consciousness = new Consciousness({
          vault: this.vault,
          healthMonitor: this.healthMonitor,
          feedbackStore: {
            getInsights: () => {
              const raw = this.architect!.getFeedbackInsights();
              return {
                ...raw,
                suggestedAdjustments: raw.suggestedAdjustments as Record<string, number>,
              };
            },
          },
          correctionStore: {
            getStats: () => this.architect!.getCorrectionStats(),
          },
          preferenceHistory: {
            detectConflicts: () => this.architect!.getPreferenceConflicts(),
          },
          getResourceMetrics: () => {
            const mem = process.memoryUsage();
            return {
              memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
              cpuPercent: 0, // CPU % requires sampling; omit for now
              activeConnections: this.gateway?.getConnections().length ?? 0,
              uptimeSeconds: Math.round(process.uptime()),
            };
          },
          getCapabilityMetrics: () => {
            const tools = toolRegistry.list();
            return {
              totalCapabilities: tools.length,
              healthyCapabilities: tools.length,
              degradedCapabilities: [],
            };
          },
          actionExecutor: async (command: string) => {
            this.logger.info('Consciousness repair action (log-only)', { command });
            return `[log-only] ${command}`;
          },
          onNotify: (diagnosis: any, action: any) => {
            this.logger.info('Consciousness repair notification', {
              diagnosis: diagnosis?.description,
              action: action.description,
            });
          },
          onApprovalRequest: async () => false, // deny auto-repair initially
          decisionLog: {
            query: (q: any) => this.architect!.queryDecisions(q),
            getDueFollowUps: () => this.architect!.getDueFollowUps(),
          },
          version: '1.4.0',
          monitorIntervalMs: 60_000,
        });
        await this.consciousness.initialize();
        this.logger.info('Consciousness orchestrator initialized');
      } catch (err) {
        this.logger.warn('Failed to initialize consciousness', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }

    // Build enrichment pipeline from available subsystems
    this.buildEnrichmentPipeline();
    this.logger.info('Enrichment pipeline initialized');

    // Initialize gateway
    this.gateway = new Gateway({
      config: this.config,
      needsSetup: async () => {
        if (!(await vaultExists())) return true;
        const name = this.config.agent?.name ?? 'Auxiora';
        let hasSoul = false;
        try { await fs.access(getSoulPath()); hasSoul = true; } catch {}
        return name === 'Auxiora' && !hasSoul;
      },
    });
    this.gateway.onMessage(this.handleMessage.bind(this));

    // Stream curated audit events to dashboard via WebSocket
    const auditLogger = getAuditLogger();
    auditLogger.onEntry = (entry) => {
      const isActivityEvent = ACTIVITY_EVENT_PREFIXES.some(
        (prefix) => entry.event.startsWith(prefix)
      );
      if (isActivityEvent) {
        this.gateway.broadcast(
          { type: 'activity', payload: entry },
          (client) => client.authenticated
        );
      }
    };

    // Initialize durable job queue
    const jobQueueDbPath = path.join(path.dirname(getBehaviorsPath()), 'jobs.db');
    this.jobQueue = new JobQueue(jobQueueDbPath, {
      pollIntervalMs: 2000,
      concurrency: 5,
    });

    // Register behavior handler
    this.jobQueue.register<{ behaviorId: string }, void>('behavior', async (payload) => {
      if (this.behaviors) {
        await this.behaviors.executeNow(payload.behaviorId);
      }
    });

    // Register ambient pattern flush handler (re-enqueues itself on success only)
    this.jobQueue.register<Record<string, never>, void>('ambient-flush', async (_payload, ctx) => {
      if (this.ambientEngine) {
        const serialized = this.ambientEngine.serialize();
        ctx.checkpoint(serialized);
      }
    });

    // Listen for completion to schedule the next flush (avoids runaway re-enqueue on failure)
    this.jobQueue.on('job:completed', (data: unknown) => {
      const { job } = data as { job: { type: string } };
      if (job.type === 'ambient-flush' && this.jobQueue) {
        // Check for existing pending ambient-flush before enqueueing
        const pending = this.jobQueue.listJobs({ type: 'ambient-flush', status: 'pending' });
        if (pending.length === 0) {
          this.jobQueue.enqueue('ambient-flush', {}, { scheduledAt: Date.now() + 5 * 60 * 1000 });
        }
      }
    });

    // Purge stale ambient-flush jobs that accumulated from the re-enqueue bug
    const purgedPending = this.jobQueue.purgeByType('ambient-flush', 'pending');
    const purgedDead = this.jobQueue.purgeByType('ambient-flush', 'dead');
    if (purgedPending > 0 || purgedDead > 0) {
      this.logger.info(`Purged stale ambient-flush jobs: ${purgedPending} pending, ${purgedDead} dead`);
    }

    // Register model registry refresh job
    this.jobQueue.register<Record<string, never>, string>('model-registry-refresh', async () => {
      const results: string[] = [];
      if (!this.modelRegistry) return 'No model registry';

      try {
        const orKey = this.vault.get('OPENROUTER_API_KEY');
        if (orKey) {
          const { fetchOpenRouterModels, mapToDiscoveredModels } = await import('@auxiora/provider-openrouter');
          const orModels = await fetchOpenRouterModels(orKey);
          const discovered = mapToDiscoveredModels(orModels);
          this.modelRegistry.upsertModels(discovered as import('@auxiora/model-registry').DiscoveredModel[]);

          try {
            const orProvider = this.providers.getProvider('openrouter');
            if (orProvider && 'updateModels' in orProvider) {
              const caps = this.modelRegistry.toModelCapabilities('openrouter');
              (orProvider as { updateModels(m: Record<string, unknown>): void }).updateModels(caps);
            }
          } catch { /* provider may not be registered */ }
          results.push(`OpenRouter: ${discovered.length} models`);
        }
      } catch (err) {
        results.push(`OpenRouter: failed - ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        const hfToken = this.vault.get('HUGGINGFACE_API_TOKEN');
        if (hfToken) {
          const { fetchHFModels, mapToDiscoveredModels } = await import('@auxiora/provider-huggingface');
          const hfModels = await fetchHFModels(hfToken);
          const discovered = mapToDiscoveredModels(hfModels);
          this.modelRegistry.upsertModels(discovered as import('@auxiora/model-registry').DiscoveredModel[]);

          try {
            const hfProvider = this.providers.getProvider('huggingface');
            if (hfProvider && 'updateModels' in hfProvider) {
              const caps = this.modelRegistry.toModelCapabilities('huggingface');
              (hfProvider as { updateModels(m: Record<string, unknown>): void }).updateModels(caps);
            }
          } catch { /* provider may not be registered */ }
          results.push(`HuggingFace: ${discovered.length} models`);
        }
      } catch (err) {
        results.push(`HuggingFace: failed - ${err instanceof Error ? err.message : String(err)}`);
      }

      const pruned = this.modelRegistry.pruneStale(7 * 24 * 60 * 60 * 1000);
      if (pruned > 0) results.push(`Pruned ${pruned} stale models`);

      return results.join(', ');
    });

    this.jobQueue.start();
    this.logger.info('Durable job queue initialized');

    // Initialize model registry and schedule refresh
    try {
      const { ModelRegistry } = await import('@auxiora/model-registry');
      const registryDbPath = path.join(path.dirname(getBehaviorsPath()), 'model-registry.db');
      this.modelRegistry = new ModelRegistry(registryDbPath);

      // Enqueue initial refresh if any dynamic provider keys exist
      const hasOpenRouter = !!this.vault.get('OPENROUTER_API_KEY');
      const hasHuggingFace = !!this.vault.get('HUGGINGFACE_API_TOKEN');
      if (hasOpenRouter || hasHuggingFace) {
        this.jobQueue.enqueue('model-registry-refresh', {});

        // Schedule periodic refresh
        const refreshMs = Math.min(
          this.config.provider.openrouter?.refreshIntervalHours ?? 4,
          this.config.provider.huggingface?.refreshIntervalHours ?? 4,
        ) * 60 * 60 * 1000;

        this.modelRefreshTimer = setInterval(() => {
          if (this.jobQueue) {
            this.jobQueue.enqueue('model-registry-refresh', {});
          }
        }, refreshMs);

        this.logger.info(`Model registry initialized, refresh every ${refreshMs / 3600000}h`);
      }
    } catch (err) {
      this.logger.warn('Failed to initialize model registry', { error: err instanceof Error ? err : new Error(String(err)) });
    }

    // Initialize behavior system
    if (this.providers) {
      this.behaviors = new BehaviorManager({
        storePath: getBehaviorsPath(),
        jobQueue: this.jobQueue,
        executorDeps: {
          getProvider: () => this.providers.getPrimaryProvider() as any,
          sendToChannel: async (channelType: string, channelId: string, message: { content: string }) => {
            this.logger.info('sendToChannel called', { channelType, channelId, hasChannels: !!this.channels });

            let delivered = false;

            // Always broadcast to webchat + persist
            this.gateway.broadcast({
              type: 'message',
              payload: { role: 'assistant', content: message.content },
            });
            this.persistToWebchat(message.content);
            delivered = true; // webchat broadcast is best-effort but counts

            // Deliver to all connected external channels
            if (this.channels) {
              const connected = this.channels.getConnectedChannels();
              this.logger.info('Connected channels for delivery', { connected });

              for (const ct of connected) {
                const targetId = this.lastActiveChannels.get(ct)
                  ?? this.channels.getDefaultChannelId(ct);
                this.logger.info('Channel delivery target', { channel: ct, targetId, fromLastActive: this.lastActiveChannels.get(ct) });
                if (!targetId) continue;
                const result = await this.channels.send(ct as any, targetId, { content: message.content });
                if (result.success) {
                  delivered = true;
                } else {
                  this.logger.warn('Channel delivery failed', { channel: ct, targetId, error: new Error(result.error ?? 'unknown') });
                }
              }
            }

            return { success: delivered };
          },
          getSystemPrompt: () => this.systemPrompt,
          executeWithTools: async (messages, systemPrompt) => {
            const execId = `behavior-exec-${Date.now()}`;
            const actionPreview = messages[0]?.content?.slice(0, 80) ?? 'Behavior';
            this.agentStart(execId, 'behavior', actionPreview);

            // Use unique senderId so getOrCreate never reuses a stale behavior session
            const session = await this.sessions.getOrCreate(execId, {
              channelType: 'behavior',
              senderId: execId,
              clientId: execId,
            });
            for (const msg of messages) {
              await this.sessions.addMessage(session.id, msg.role as 'user' | 'assistant', msg.content);
            }
            const provider = this.providers.getPrimaryProvider();
            const noopChunk = () => {};
            try {
              const fallbackCandidates = this.providers.resolveFallbackCandidates();
              const result = await this.executeWithTools(session.id, messages, systemPrompt, provider, noopChunk, { fallbackCandidates });
              this.agentEnd(execId, true);
              return { content: result.response, usage: result.usage };
            } catch (err) {
              this.agentEnd(execId, false);
              throw err;
            }
          },
        },
        auditFn: (event: string, details: Record<string, unknown>) => {
          audit(event as any, details);
        },
      });
      await this.behaviors.start();
      setBehaviorManager(this.behaviors);
    }

    // Initialize browser system
    this.browserManager = new BrowserManager({
      config: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        navigationTimeout: 30_000,
        actionTimeout: 10_000,
        maxConcurrentPages: 10,
        screenshotDir: getScreenshotsDir(),
      },
    });
    setBrowserManager(this.browserManager);

    // Initialize OS bridge
    const clipboardMonitor = new ClipboardMonitor();
    const appController = new AppController(process.platform as Platform);
    const systemStateMonitor = new SystemStateMonitor();
    setClipboardMonitor(clipboardMonitor);
    setAppController(appController);
    setSystemStateMonitor(systemStateMonitor);
    this.logger.info('OS bridge initialized');

    // Initialize email intelligence (engines ready; connectors needed for full functionality)
    const emailTriageEngine = new EmailTriageEngine();
    const threadSummarizer = new ThreadSummarizer();
    setEmailIntelligence({
      triage: {
        getTriageSummary: async () => ({
          categories: { urgent: [], action: [], fyi: [], newsletter: [], spam: [] },
          total: 0,
          message: 'Connect an email account to enable triage. Use /connect google-workspace',
        }),
        engine: emailTriageEngine,
      },
      summarizer: {
        summarizeThread: async () => ({
          summary: 'Connect an email account to enable thread summarization.',
        }),
        engine: threadSummarizer,
      },
    });
    this.logger.info('Email intelligence initialized');

    // Initialize calendar intelligence (engines ready; connectors needed for full functionality)
    const scheduleAnalyzer = new ScheduleAnalyzer();
    const scheduleOptimizer = new ScheduleOptimizer();
    const meetingPrepGenerator = new MeetingPrepGenerator();
    setCalendarIntelligence({
      analyzeDay: async (date: string) => scheduleAnalyzer.analyzeDay([], date),
      suggest: (analysis: any) => scheduleOptimizer.suggest(analysis),
      getMeetingBrief: async () => ({
        message: 'Connect a calendar account to enable meeting preparation. Use /connect google-workspace',
      }),
      analyzer: scheduleAnalyzer,
      optimizer: scheduleOptimizer,
      meetingPrep: meetingPrepGenerator,
    });
    this.logger.info('Calendar intelligence initialized');

    // Initialize contacts system
    const contactGraph = new ContactGraph();
    const contextRecall = new ContextRecall(contactGraph);
    setContactGraph(contactGraph);
    setContextRecall(contextRecall);
    this.logger.info('Contacts system initialized');

    // Initialize compose system
    const composeEngine = new ComposeEngine();
    const grammarChecker = new GrammarChecker();
    const languageDetector = new LanguageDetector();
    setComposeEngine(composeEngine);
    setGrammarChecker(grammarChecker);
    setLanguageDetector(languageDetector);
    this.logger.info('Compose system initialized');

    // Initialize voice system (if enabled — auto-detects providers)
    if (this.config.voice?.enabled) {
      const detected = await detectVoiceProviders(
        {
          sttProvider: this.config.voice.sttProvider ?? 'auto',
          ttsProvider: this.config.voice.ttsProvider ?? 'auto',
        },
        this.vault,
      );

      if (detected.stt.provider && detected.tts.provider) {
        let openaiKey: string | undefined;
        let elevenKey: string | undefined;
        try { openaiKey = this.vault.get('OPENAI_API_KEY'); } catch { /* vault locked or key missing */ }
        try { elevenKey = this.vault.get('ELEVENLABS_API_KEY'); } catch { /* vault locked or key missing */ }

        const sttProvider = createSTTProvider(detected.stt.provider, {
          apiKey: openaiKey,
          binaryPath: detected.stt.binaryPath,
          modelPath: detected.stt.modelPath,
        });
        const ttsProvider = createTTSProvider(detected.tts.provider, {
          apiKey: detected.tts.provider === 'elevenlabs-tts' ? elevenKey : openaiKey,
          binaryPath: detected.tts.binaryPath,
          modelPath: detected.tts.modelPath,
          defaultVoice: this.config.voice.defaultVoice,
        });

        this.voiceManager = new VoiceManager({
          sttProvider,
          ttsProvider,
          config: {
            enabled: true,
            defaultVoice: this.config.voice.defaultVoice,
            language: this.config.voice.language,
            maxAudioDuration: this.config.voice.maxAudioDuration,
            sampleRate: this.config.voice.sampleRate,
          },
        });
        this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
        this.logger.info('Voice mode enabled', {
          stt: detected.stt.provider,
          tts: detected.tts.provider,
        });
      } else {
        audit('voice.skipped', { sttReason: detected.stt.reason, ttsReason: detected.tts.reason });
        this.logger.warn('Voice mode enabled but no providers available', {
          stt: detected.stt.reason,
          tts: detected.tts.reason,
        });
      }
    }

    // Initialize webhook system (if enabled)
    if (this.config.webhooks?.enabled) {
      this.webhookManager = new WebhookManager({
        storePath: getWebhooksPath(),
        config: {
          enabled: true,
          basePath: this.config.webhooks.basePath,
          signatureHeader: this.config.webhooks.signatureHeader,
          maxPayloadSize: this.config.webhooks.maxPayloadSize,
        },
      });

      setWebhookManager(this.webhookManager);

      // Wire behavior trigger
      if (this.behaviors) {
        this.webhookManager.setBehaviorTrigger(async (behaviorId: string, payload: string) => {
          return this.behaviors!.executeNow(behaviorId);
        });
      }

      // Mount webhook routes
      const webhookRouter = this.createWebhookRouter();
      this.gateway.mountRouter(this.config.webhooks.basePath, webhookRouter);
      this.logger.info('Webhook listeners enabled');
    }

    // Initialize dashboard (if enabled)
    if (this.config.dashboard?.enabled) {
      // Capture class reference for lazy getters (getters rebind `this` to the deps object)
      const self = this;
      const { router } = createDashboardRouter({
        deps: {
          vault: this.vault,
          getActiveModel: () => {
            const primary = this.config.provider.primary;
            const fallback = this.config.provider.fallback;
            const providerConfig = (this.config.provider as Record<string, any>)[primary];
            return { provider: primary, fallback, model: providerConfig?.model ?? 'default' };
          },
          onVaultUnlocked: async () => {
            // Re-initialize providers and channels after vault unlock on restart
            await this.initializeProviders();
            if (this.providers) {
              this.initializeRouter();
              setProviderFactory(this.providers);
            }
            const channels = this.channels;
            if (!channels) {
              await this.initializeChannels();
              const ch = this.channels;
              if (ch) {
                await ch.connectAll();
                this.logger.info('Channels connected after vault unlock');
              }
            }
            // Restore connector tokens now that vault is accessible
            if (this.connectorRegistry && this.connectorAuthManager) {
              for (const connector of this.connectorRegistry.list()) {
                try {
                  const tokenData = this.vault.get(`connectors.${connector.id}.tokens`);
                  if (tokenData) {
                    const tokens = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
                    await this.connectorAuthManager.authenticate(connector.id, connector.auth, tokens);
                  }
                } catch (err) {
                  this.logger.warn(`Failed to restore tokens for connector ${connector.id}: ${err instanceof Error ? err.message : String(err)}`);
                }
              }
              this.registerConnectorTools();
              this.logger.info('Connector tools registered after vault unlock');
            }
          },
          behaviors: this.behaviors ? {
            list: (filter?: { type?: string; status?: string }) => this.behaviors!.list(filter as any),
            get: (id: string) => this.behaviors!.get(id),
            create: (input: Record<string, unknown>) => this.behaviors!.create(input as any),
            update: (id: string, updates: Record<string, unknown>) => this.behaviors!.update(id, updates),
            remove: (id: string) => this.behaviors!.remove(id),
          } : undefined,
          webhooks: this.webhookManager ? {
            list: () => this.webhookManager!.list(),
            create: (options: Record<string, unknown>) => this.webhookManager!.create(options as any),
            update: (id: string, updates: Record<string, unknown>) => this.webhookManager!.update(id, updates),
            delete: (id: string) => this.webhookManager!.delete(id),
          } : undefined,
          getConfiguredChannels: () => {
            const ch = this.config.channels;
            return Object.entries(ch)
              .filter(([, v]) => typeof v === 'object' && v !== null)
              .map(([type, v]) => ({ type, enabled: !!(v as any).enabled }));
          },
          getActiveAgents: () => this.getActiveAgents(),
          getHealthState: () => this.healthMonitor?.getHealthState() ?? { overall: 'unknown', subsystems: [], issues: [], lastCheck: '' },
          getCapabilities: () => this.capabilityCatalog?.getCatalog() ?? null,
          getConnections: () => this.gateway.getConnections(),
          getAuditEntries: async (limit?: number) => {
            const auditLogger = getAuditLogger();
            return auditLogger.getEntries(limit);
          },
          getPlugins: () => this.pluginLoader?.listPlugins() ?? [],
          getMemories: async () => this.memoryStore?.getAll() ?? [],
          get connectors() {
            const reg = self.connectorRegistry;
            const auth = self.connectorAuthManager;
            if (!reg || !auth) return undefined;
            return {
              list: () => reg.list().map(c => ({
                id: c.id, name: c.name, category: c.category,
                auth: { type: c.auth.type },
              })),
              get: (id: string) => reg.get(id),
              connect: async (connectorId: string, credentials: Record<string, string>) => {
                const connector = reg.get(connectorId);
                if (!connector) return null;
                return auth.authenticate(connectorId, connector.auth, credentials);
              },
              disconnect: async (connectorId: string) => {
                return auth.revokeToken(connectorId);
              },
              getActions: (connectorId: string) => reg.getActions(connectorId),
              executeAction: async (connectorId: string, actionId: string, params: Record<string, unknown>) => {
                const connector = reg.get(connectorId);
                if (!connector) return { success: false, error: 'Connector not found' };
                const token = auth.getToken(connectorId);
                if (!token) return { success: false, error: 'Not authenticated' };
                try {
                  const data = await connector.executeAction(actionId, params, token.accessToken);
                  return { success: true, data };
                } catch (err: unknown) {
                  return { success: false, error: err instanceof Error ? err.message : String(err) };
                }
              },
            };
          },
          models: this.providers ? {
            listProviders: () => {
              const result = [];
              for (const name of this.providers.listAvailable()) {
                const p = this.providers.getProvider(name);
                // Detect credential source for Anthropic
                let credentialSource: string | undefined;
                if (name === 'anthropic') {
                  try {
                    if (this.vault.get('ANTHROPIC_OAUTH_TOKEN') || (this.vault.get('ANTHROPIC_API_KEY') && isSetupToken(this.vault.get('ANTHROPIC_API_KEY')!))) {
                      credentialSource = 'oauth';
                    } else if (this.vault.get('ANTHROPIC_API_KEY')) {
                      credentialSource = 'api-key';
                    } else if (readClaudeCliCredentials() !== null) {
                      credentialSource = 'claude-cli';
                    }
                  } catch {
                    // vault locked — check CLI as last resort
                    if (readClaudeCliCredentials() !== null) {
                      credentialSource = 'claude-cli';
                    }
                  }
                }
                result.push({
                  name,
                  displayName: credentialSource === 'claude-cli' ? 'Anthropic Claude (via Claude Code)' : p.metadata.displayName,
                  available: true,
                  models: p.metadata.models,
                  credentialSource,
                });
              }
              return result;
            },
            getRoutingConfig: () => ({
              enabled: this.config.routing?.enabled !== false,
              primary: this.config.provider.primary,
              fallback: this.config.provider.fallback,
              defaultModel: this.config.routing?.defaultModel,
              rules: this.config.routing?.rules ?? [],
              preferences: this.config.routing?.preferences ?? {},
              costLimits: this.config.routing?.costLimits ?? {},
            }),
            getCostSummary: () => this.modelRouter?.getCostSummary() ?? {
              today: 0, thisMonth: 0, isOverBudget: false, warningThresholdReached: false,
            },
          } : undefined,
          orchestration: this.orchestrationEngine ? {
            getConfig: () => ({
              enabled: this.config.orchestration?.enabled !== false,
              maxConcurrentAgents: this.config.orchestration?.maxConcurrentAgents ?? 5,
              allowedPatterns: this.config.orchestration?.allowedPatterns ?? [],
            }),
            getHistory: (limit?: number) => {
              const max = limit ?? 20;
              return this.orchestrationHistory.slice(-max);
            },
          } : undefined,
          memory: {
            getLivingState: async () => {
              const state = await this.getLivingMemoryState();
              return state ?? { facts: [], relationships: [], patterns: [], adaptations: [], stats: { totalMemories: 0, oldestMemory: 0, newestMemory: 0, averageImportance: 0, topTags: [] } };
            },
            getStats: async () => this.memoryStore ? this.memoryStore.getStats() : {},
            getAdaptations: async () => this.personalityAdapter ? this.personalityAdapter.getAdjustments() : [],
            deleteMemory: async (id: string) => this.memoryStore ? this.memoryStore.remove(id) : false,
            exportAll: async () => this.memoryStore ? this.memoryStore.exportAll() : { version: '1.0', memories: [], exportedAt: Date.now() },
            importAll: async (data: { memories: any[] }) => this.memoryStore ? this.memoryStore.importAll(data) : { imported: 0, skipped: 0 },
          },
          sessions: {
            getWebchatMessages: async () => {
              // Use getOrCreate so the session is loaded from disk if not yet in memory
              const webchat = await this.sessions.getOrCreate('webchat', {
                channelType: 'webchat',
              });
              return webchat.messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp }));
            },
            listChats: (options?: { archived?: boolean; limit?: number; offset?: number }) =>
              this.sessions.listChats(options),
            createChat: (title?: string) =>
              this.sessions.createChat(title),
            renameChat: (chatId: string, title: string) =>
              this.sessions.renameChat(chatId, title),
            archiveChat: (chatId: string) =>
              this.sessions.archiveChat(chatId),
            deleteChat: (chatId: string) =>
              this.sessions.deleteChat(chatId),
            getChatMessages: (chatId: string) =>
              this.sessions.getChatMessages(chatId),
            updateChatMetadata: (chatId: string, metadata: Record<string, unknown>) =>
              this.sessions.updateChatMetadata(chatId, metadata),
          },
          getPersonalityEngine: () => this.config.agent.personality ?? 'standard',
          setPersonalityEngine: (engine: string) => this.setPersonalityEngine(engine),
          get trust() {
            return self.trustEngine && self.trustAuditTrail && self.rollbackManager ? {
              getLevels: () => self.trustEngine!.getAllLevels(),
              getLevel: (domain: string) => self.trustEngine!.getTrustLevel(domain as any),
              setLevel: async (domain: string, level: number, reason: string) => {
                await self.trustEngine!.setTrustLevel(domain as any, level as any, reason);
              },
              getAuditEntries: (limit?: number) => self.trustAuditTrail!.query({ limit }),
              getAuditEntry: (id: string) => self.trustAuditTrail!.getById(id),
              rollback: async (id: string) => self.rollbackManager!.rollback(id),
              getPromotions: () => self.trustEngine!.getPromotions(),
            } : undefined;
          },
          // [P14] Team / Social
          get team() {
            return self.userManager ? {
              listUsers: () => self.userManager!.listUsers(),
              createUser: (name: string, role: string, channels?: any[]) =>
                self.userManager!.createUser(name, role, { channels }),
              deleteUser: (id: string) => self.userManager!.deleteUser(id),
            } : undefined;
          },
          // [P14] Workflows
          get workflows() {
            return self.workflowEngine && self.approvalManager ? {
              listActive: () => self.workflowEngine!.listActive(),
              listAll: () => self.workflowEngine!.listAll(),
              getStatus: (id: string) => self.workflowEngine!.getStatus(id),
              createWorkflow: (options: any) => self.workflowEngine!.createWorkflow(options),
              completeStep: (wfId: string, stepId: string, completedBy: string) =>
                self.workflowEngine!.completeStep(wfId, stepId, completedBy),
              cancelWorkflow: (id: string) => self.workflowEngine!.cancelWorkflow(id),
              getPendingApprovals: (userId?: string) => self.approvalManager!.getPending(userId),
              approve: (id: string, userId: string, reason?: string) =>
                self.approvalManager!.approve(id, userId, reason),
              reject: (id: string, userId: string, reason?: string) =>
                self.approvalManager!.reject(id, userId, reason),
            } : undefined;
          },
          // [P14] Agent Protocol
          get agentProtocol() {
            return self.agentProtocol && self.agentDirectory ? {
              getIdentity: () => self.agentProtocol!.getIdentity(),
              getInbox: (limit?: number) => self.agentProtocol!.getInbox(limit),
              discover: (query: string) => self.agentProtocol!.discover(query),
              getDirectory: () => self.agentDirectory!.listAll(),
            } : undefined;
          },
          // [P15] Screen
          get screen() {
            return self.screenCapturer ? {
              capture: async () => {
                const cap = await self.screenCapturer!.captureScreen();
                return { image: cap.image.toString('base64'), dimensions: cap.dimensions };
              },
              analyze: async (question?: string) => {
                if (!self.screenAnalyzer) return 'Screen analyzer not available';
                const cap = await self.screenCapturer!.captureScreen();
                return self.screenAnalyzer.analyzeScreen(cap.image, question);
              },
            } : undefined;
          },
          // [P15] Ambient
          get ambient() {
            return self.ambientEngine && self.ambientNotifications ? {
              getPatterns: () => self.ambientEngine!.getPatterns(),
              getNotifications: () => self.ambientNotifications!.getQueue(),
              dismissNotification: (id: string) => self.ambientNotifications!.dismiss(id),
              getBriefing: (time: string) => {
                return self.briefingGenerator!.generateBriefing(
                  'dashboard', time === 'evening' ? 'evening' : 'morning',
                  {
                    patterns: self.ambientEngine!.getPatterns(),
                    notifications: self.ambientNotifications!.getQueue(),
                    anticipations: self.anticipationEngine!.getAnticipations(),
                  },
                );
              },
              getAnticipations: () => self.anticipationEngine!.getAnticipations(),
            } : undefined;
          },
          // [P15] Conversation
          get conversation() {
            return self.conversationEngine ? {
              getState: () => self.conversationEngine!.getState(),
              start: () => self.conversationEngine!.start(),
              stop: () => self.conversationEngine!.stop(),
              getTurnCount: () => self.conversationEngine!.getTurnCount(),
            } : undefined;
          },
          setup: {
            personality: (() => {
              const mgr = new PersonalityManager(
                path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../personality/templates'),
                getWorkspacePath(),
              );
              return {
                listTemplates: () => mgr.listTemplates(),
                applyTemplate: (id: string) => mgr.applyTemplate(id),
                buildCustom: (config: Record<string, unknown>) =>
                  mgr.buildCustom(config as unknown as import('@auxiora/personality').SoulConfig),
                getActiveTemplate: async () => {
                  const soulPath = path.join(getWorkspacePath(), 'SOUL.md');
                  let content: string;
                  try { content = await fs.readFile(soulPath, 'utf-8'); } catch { return null; }
                  // Read template ID from frontmatter
                  const match = content.match(/^---\n[\s\S]*?template:\s*(\S+)/);
                  if (!match) return null;
                  const templateId = match[1];
                  const template = await mgr.getTemplate(templateId);
                  return template ? { id: template.id, name: template.name } : null;
                },
              };
            })(),
            saveConfig: async (updates: Record<string, unknown>) => {
              const current = await loadConfig();
              const merged = deepMerge(current, updates);
              await saveFullConfig(merged as Config);
              this.config = await loadConfig();
              // Rebuild system prompt if agent identity changed
              if (updates.agent) {
                await this.loadPersonality();
              }
              // Re-initialize channels when channel config changes
              if (updates.channels) {
                await this.reinitializeChannels();
              }
            },
            getAgentName: () => this.config.agent?.name ?? 'Auxiora',
            getAgentPronouns: () => this.config.agent?.pronouns ?? 'they/them',
            getAgentConfig: () => (this.config.agent ?? {}) as Record<string, unknown>,
            getSoulContent: async () => {
              try {
                return await fs.readFile(getSoulPath(), 'utf-8');
              } catch {
                return null;
              }
            },
            saveSoulContent: async (content: string) => {
              const soulPath = getSoulPath();
              const dir = path.dirname(soulPath);
              await fs.mkdir(dir, { recursive: true });
              await fs.writeFile(soulPath, content, 'utf-8');
            },
            hasSoulFile: async () => {
              try {
                await fs.access(getSoulPath());
                return true;
              } catch {
                return false;
              }
            },
            vaultExists: () => vaultExists(),
            onSetupComplete: async () => {
              await this.initializeProviders();
              if (this.providers) {
                this.initializeRouter();
                setProviderFactory(this.providers);
                this.logger.info('Providers re-initialized after setup');
              }
              // Reload personality so the agent uses the name entered during setup
              await this.loadPersonality();
              this.logger.info('Personality reloaded after setup');
              // Connect channels now that vault is unlocked with credentials
              await this.initializeChannels();
              const channels = this.channels;
              if (channels) {
                await channels.connectAll();
                this.logger.info('Channels connected after setup');
              }
              // Restore connector tokens now that vault is accessible
              if (this.connectorRegistry && this.connectorAuthManager) {
                for (const connector of this.connectorRegistry.list()) {
                  try {
                    const tokenData = this.vault.get(`connectors.${connector.id}.tokens`);
                    if (tokenData) {
                      const tokens = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
                      await this.connectorAuthManager.authenticate(connector.id, connector.auth, tokens);
                    }
                  } catch (err) {
                    this.logger.warn(`Failed to restore tokens for connector ${connector.id}: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }
                this.registerConnectorTools();
                this.logger.info('Connector tools registered after setup');
              }
            },
          },
        },
        config: {
          enabled: true,
          sessionTtlMs: this.config.dashboard.sessionTtlMs,
        },
        verifyPassword: (input: string) => {
          try {
            const stored = this.vault.get('DASHBOARD_PASSWORD');
            if (!stored) return false;
            const a = Buffer.from(stored, 'utf-8');
            const b = Buffer.from(input, 'utf-8');
            if (a.length !== b.length) return false;
            return crypto.timingSafeEqual(a, b);
          } catch {
            return false; // Vault locked
          }
        },
      });

      this.gateway.mountRouter('/api/v1/dashboard', router);

      // Serve static SPA files
      const dashboardUiPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../dashboard/dist-ui'
      );
      this.gateway.mountRouter('/dashboard', express.static(dashboardUiPath) as any);

      // SPA catch-all: serve index.html for client-side routing
      const dashboardIndexPath = path.join(dashboardUiPath, 'index.html');
      const spaRouter = Router();
      spaRouter.get('/{*splat}', (_req: Request, res: Response) => {
        res.sendFile(dashboardIndexPath);
      });
      this.gateway.mountRouter('/dashboard', spaRouter as any);

      this.logger.info('Dashboard enabled at /dashboard');
    }

    // MCP management API routes
    this.gateway.mountRouter('/api/v1/mcp', this.createMcpRouter());

    // Personality management API routes
    if (this.architect) {
      const personalityRouter = this.createPersonalityRouter();
      this.gateway.mountRouter('/api/v1/personality', personalityRouter);
    }

    // Ambient agent API routes
    if (this.ambientEngine) {
      const ambientRouter = this.createAmbientRouter();
      this.gateway.mountRouter('/api/v1/ambient', ambientRouter);
    }

    // Deep research API routes
    const researchRouter = this.createResearchRouter();
    this.gateway.mountRouter('/api/v1/research', researchRouter);

    // Agent protocol API routes
    if (this.agentProtocol) {
      this.gateway.mountRouter('/api/v1/agent-protocol', this.createAgentProtocolRouter());
    }

    // Webhooks management API routes
    if (this.webhookManager) {
      this.gateway.mountRouter('/api/v1/webhooks', this.createWebhooksRouter());
    }

    // Consciousness API routes
    if (this.consciousness) {
      this.gateway.mountRouter('/api/v1/consciousness', this.createConsciousnessRouter());
    }

    // Voice API routes
    if (this.voiceManager) {
      this.gateway.mountRouter('/api/v1/voice', this.createVoiceRouter());
    }

    // Trust engine API routes
    if (this.trustEngine) {
      this.gateway.mountRouter('/api/v1/trust', this.createTrustRouter());
    }

    // Workflow API routes
    if (this.workflowEngine) {
      this.gateway.mountRouter('/api/v1/workflows', this.createWorkflowRouter());
    }

    // Connector API routes
    if (this.connectorRegistry) {
      this.gateway.mountRouter('/api/v1/connectors', this.createConnectorRouter());
    }

    // Self-update API routes
    if (this.updater) {
      this.gateway.mountRouter('/api/v1/update', this.createUpdateRouter());
    }

    // RAG API routes
    if (this.documentStore) {
      this.gateway.mountRouter('/api/v1/rag', this.createRagRouter());
    }

    // Evaluation API routes
    if (this.evalStore) {
      this.gateway.mountRouter('/api/v1/eval', this.createEvalRouter());
    }

    // Image generation API routes
    if (this.imageGenManager) {
      this.gateway.mountRouter('/api/v1/images', this.createImageRouter());
    }

    // Knowledge graph API routes
    if (this.knowledgeGraph) {
      this.gateway.mountRouter('/api/v1/knowledge', this.createKnowledgeRouter());
    }

    // Code interpreter API routes
    if (this.codeSessionManager) {
      this.gateway.mountRouter('/api/v1/code', this.createCodeRouter());
    }

    // Backup API routes
    if (this.backupManager) {
      this.gateway.mountRouter('/api/v1/backup', this.createBackupRouter());
    }

    // Approval queue API routes
    if (this.approvalQueue) {
      this.gateway.mountRouter('/api/v1/approvals', this.createApprovalQueueRouter());
    }

    // Vector store API routes
    if (this.vectorStore) {
      this.gateway.mountRouter('/api/v1/vectors', this.createVectorRouter());
    }

    // NL Automation API routes
    this.gateway.mountRouter('/api/v1/automation', this.createAutomationRouter());

    // Conversation branch API routes
    this.gateway.mountRouter('/api/v1/branches', this.createBranchRouter());

    // ReAct loop API routes
    this.gateway.mountRouter('/api/v1/react', this.createReactRouter());

    // A2A (Agent-to-Agent) API routes
    this.a2aAgentCard = new AgentCardBuilder()
      .setName('Auxiora')
      .setDescription('Auxiora AI assistant')
      .setUrl(`http://${this.config.gateway.host}:${this.config.gateway.port}`)
      .setVersion('1.0.0')
      .build();
    this.gateway.mountRouter('/api/v1/a2a', this.createA2ARouter());

    // Canvas API routes
    this.gateway.mountRouter('/api/v1/canvas', this.createCanvasRouter());

    // Canvas WebSocket upgrade handler
    this.setupCanvasWebSocket();

    // Sandbox API routes
    this.gateway.mountRouter('/api/v1/sandbox', this.createSandboxRouter());

    // Model registry API routes
    this.gateway.mountRouter('/api/v1/models', createModelRegistryRouter(Router(), {
      modelRegistry: this.modelRegistry,
      jobQueue: this.jobQueue,
    }));

    // Job queue status endpoint
    this.gateway.mountRouter('/api/v1/jobs', (() => {
      const jobsRouter = Router();
      jobsRouter.get('/status', (_req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.status(503).json({ error: 'Job queue not initialized' });
          return;
        }
        res.json(this.jobQueue.getStats());
      });

      jobsRouter.get('/list', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.json({ data: [] });
          return;
        }
        const status = req.query.status as string | undefined;
        const type = req.query.type as string | undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const filter: Record<string, unknown> = { limit };
        if (status) filter.status = status;
        if (type) filter.type = type;
        const jobs = this.jobQueue.listJobs(filter as import('@auxiora/job-queue').JobFilter);
        res.json({ data: jobs });
      });

      jobsRouter.get('/:id', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.status(404).json({ error: 'Job queue not available' });
          return;
        }
        const job = this.jobQueue.getJob(String(req.params.id));
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
        res.json({ data: job });
      });

      jobsRouter.post('/:id/retry', (req: Request, res: Response) => {
        if (!this.jobQueue) {
          res.status(503).json({ error: 'Job queue not available' });
          return;
        }
        const job = this.jobQueue.getJob(String(req.params.id));
        if (!job) {
          res.status(404).json({ error: 'Job not found' });
          return;
        }
        if (job.status !== 'dead' && job.status !== 'failed') {
          res.status(400).json({ error: 'Only dead or failed jobs can be retried' });
          return;
        }
        const newId = this.jobQueue.enqueue(job.type, job.payload);
        res.json({ data: { originalId: job.id, newJobId: newId } });
      });

      return jobsRouter;
    })());

    // OpenAI-compatible chat completions endpoint (/v1/chat/completions)
    if (this.providers) {
      let openaiCompatToken: string | undefined;
      try { openaiCompatToken = this.vault.get('OPENAI_COMPAT_TOKEN'); } catch { /* vault locked or key missing */ }

      mountOpenAICompatRoutes(this.gateway.getApp(), {
        complete: async (messages, options) => {
          const provider = this.providers.getPrimaryProvider();
          const result = await provider.complete(
            messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
            { maxTokens: options.maxTokens, temperature: options.temperature },
          );
          return {
            content: result.content,
            model: result.model,
            usage: { promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens },
          };
        },
        stream: (messages: Array<{ role: string; content: string }>, options: { model?: string; temperature?: number; maxTokens?: number }) => {
          const provider = this.providers.getPrimaryProvider();
          const gen = provider.stream(
            messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
            { maxTokens: options.maxTokens, temperature: options.temperature },
          );
          return (async function* () {
            for await (const chunk of gen) {
              if (chunk.type === 'text' && chunk.content !== undefined) {
                yield { type: 'delta' as const, text: chunk.content };
              }
            }
          })();
        },
        authToken: openaiCompatToken,
      });
      this.logger.info('OpenAI-compatible endpoint mounted at /v1/chat/completions');
    }

    // Tool approval gate — interactive approval for sensitive tool invocations
    {
      const { ToolApprovalGate } = await import('./tool-approval-gate.js');
      const approvalTools = (this.config as Record<string, unknown>).approvalTools as string[] | undefined;
      this.toolApprovalGate = new ToolApprovalGate({
        requireApproval: approvalTools ?? ['exec', 'file_write', 'browser_navigate'],
        timeoutMs: 5 * 60_000,
      });
      const gate = this.toolApprovalGate;
      mountApprovalRoutes(this.gateway.getApp(), {
        getPending: () => gate!.getPending().map(p => ({ ...p })),
        resolve: (id: string, approved: boolean, comment?: string) => {
          const r = gate!.resolve(id, approved, comment);
          return r ? { ...r } : undefined;
        },
      });
      this.logger.info('Tool approval gate mounted with routes at /api/v1/tool-approvals');
    }

    // Initialize plugin system (if enabled)
    if (this.config.plugins?.enabled !== false) {
      const pluginsDir = this.config.plugins?.dir || undefined;
      this.pluginLoader = new PluginLoader(pluginsDir);
      const seeded = await this.pluginLoader.seedStarterSkills();
      if (seeded > 0) {
        this.logger.info(`Starter skills seeded: ${seeded}`);
      }
      const loaded = await this.pluginLoader.loadAll();
      const successful = loaded.filter(p => p.status === 'loaded');
      if (loaded.length > 0) {
        this.logger.info(`Plugins: ${successful.length} loaded, ${loaded.length - successful.length} failed`);
      }

      // Register the create_skill tool so the AI can author new plugins at runtime
      if (this.providers) {
        try {
          const provider = this.providers.getPrimaryProvider();
          registerCreateSkillTool({
            loader: this.pluginLoader,
            generate: async (prompt: string) => {
              const result = await provider.complete([{ role: 'user', content: prompt }]);
              return result.content;
            },
            pluginsDir: pluginsDir,
          });
          this.logger.info('Self-authoring skills enabled (create_skill tool registered)');
        } catch {
          this.logger.warn('Self-authoring skills disabled: no AI provider available');
        }
      }
    }

    // Initialize memory system (if enabled)
    if (this.config.memory?.enabled !== false) {
      this.memoryStore = new MemoryStore({
        maxEntries: this.config.memory?.maxEntries,
      });
      this.memoryRetriever = new MemoryRetriever();
      this.patternDetector = new PatternDetector();
      this.personalityAdapter = new PersonalityAdapter(this.memoryStore);
      setMemoryStore(this.memoryStore);

      // Create extractor with AI provider (needs providers initialized)
      if (this.providers && this.providers.listAvailable().length > 0) {
        try {
          this.memoryExtractor = new MemoryExtractor(
            this.memoryStore,
            this.providers.getPrimaryProvider(),
          );
        } catch {
          this.logger.warn('Memory extractor disabled: no AI provider available');
        }
      }

      // Set up periodic cleanup of expired memories
      const cleanupMinutes = this.config.memory?.cleanupIntervalMinutes;
      if (cleanupMinutes) {
        this.memoryCleanupInterval = setInterval(
          () => void this.memoryStore?.cleanExpired(),
          cleanupMinutes * 60 * 1000,
        );
      }

      this.logger.info('Memory system enabled (living memory)');

      if (this.pluginLoader) {
        this.pluginLoader.setMemoryStore(this.memoryStore);
      }
    }

    // Initialize trust engine (if enabled)
    if (this.config.trust?.enabled !== false) {
      this.trustEngine = new TrustEngine({
        defaultLevel: (this.config.trust?.defaultLevel ?? 0) as 0 | 1 | 2 | 3 | 4,
        autoPromote: this.config.trust?.autoPromote ?? true,
        promotionThreshold: this.config.trust?.promotionThreshold ?? 10,
        demotionThreshold: this.config.trust?.demotionThreshold ?? 3,
        autoPromoteCeiling: (this.config.trust?.autoPromoteCeiling ?? 3) as 0 | 1 | 2 | 3 | 4,
      });
      await this.trustEngine.load();
      this.trustAuditTrail = new ActionAuditTrail();
      await this.trustAuditTrail.load();
      this.rollbackManager = new RollbackManager(this.trustAuditTrail);
      this.trustGate = new TrustGate(this.trustEngine);
      this.logger.info('Trust engine initialized');
    }

    // Initialize intent parser (if enabled)
    if (this.config.intent?.enabled !== false) {
      this.intentParser = new IntentParser({
        confidenceThreshold: this.config.intent?.confidenceThreshold ?? 0.3,
      });
      this.actionPlanner = new ActionPlanner();
      this.logger.info('Intent parser initialized');
    }

    // [P14] Initialize team / social system
    this.userManager = new UserManager();
    this.workflowEngine = new WorkflowEngine();
    this.approvalManager = new ApprovalManager();
    this.logger.info('Team/social system initialized');

    // [P14] Initialize agent protocol
    const agentKeys = MessageSigner.generateKeyPair();
    const agentSigner = new MessageSigner(agentKeys);
    this.agentDirectory = new AgentDirectory();
    const agentName = this.config.agent?.name ?? 'auxiora';
    const agentHost = `${this.config.gateway.host}:${this.config.gateway.port}`;
    const agentId = { user: agentName.toLowerCase(), host: agentHost };
    await this.agentDirectory.register(
      agentId,
      agentName,
      agentKeys.publicKey,
      `http://${agentHost}/api/v1/agent-protocol`,
    );
    this.agentProtocol = new AgentProtocol(agentId, agentSigner, this.agentDirectory);
    this.logger.info('Agent protocol initialized');

    // Initialize self-update system
    try {
      this.installationDetector = new InstallationDetector();
      this.versionChecker = new VersionChecker('auxiora', 'auxiora');
      const healthChecker = new HealthChecker(`http://${agentHost}`);
      const strategies = createStrategyMap();
      this.updater = new Updater({
        detector: this.installationDetector,
        versionChecker: this.versionChecker,
        healthChecker,
        strategies,
      });
      // Recover from any incomplete previous update
      const recovery = await this.updater.recoverIfNeeded();
      if (recovery) {
        this.logger.warn('Recovered from incomplete update', {
          previousVersion: recovery.previousVersion,
          targetVersion: recovery.newVersion,
        });
      }
      this.logger.info('Self-update system initialized');
    } catch (err) {
      this.logger.warn('Failed to initialize self-update system', {
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }

    // [P15] Initialize ambient intelligence
    // Restore persisted patterns from vault, or start fresh
    try {
      const storedPatterns = this.vault.get('ambient:patterns');
      this.ambientEngine = storedPatterns
        ? AmbientPatternEngine.deserialize(storedPatterns)
        : new AmbientPatternEngine();
    } catch {
      this.ambientEngine = new AmbientPatternEngine();
    }
    this.ambientNotifications = new QuietNotificationManager();
    this.briefingGenerator = new BriefingGenerator();
    this.anticipationEngine = new AnticipationEngine();
    this.ambientAwarenessCollector = new AmbientAwarenessCollector();
    if (this.jobQueue) {
      // Only enqueue if no ambient-flush jobs already exist (prevents buildup on restart)
      const existing = this.jobQueue.listJobs({ type: 'ambient-flush', status: 'pending' });
      if (existing.length === 0) {
        this.jobQueue.enqueue('ambient-flush', {}, { scheduledAt: Date.now() + 5 * 60 * 1000 });
      }
    }
    this.logger.info('Ambient intelligence initialized');

    // Initialize RAG document store
    this.documentStore = new DocumentStore();
    this.contextBuilder = new ContextBuilder();
    this.logger.info('RAG document store initialized');

    // Initialize image generation (conditional on provider keys)
    {
      let openaiKey: string | undefined;
      let replicateToken: string | undefined;
      try { openaiKey = this.vault.get('OPENAI_API_KEY'); } catch { /* vault locked */ }
      try { replicateToken = this.vault.get('REPLICATE_API_TOKEN'); } catch { /* vault locked */ }
      if (openaiKey || replicateToken) {
        this.imageGenManager = new ImageGenManager();
        if (openaiKey) {
          this.imageGenManager.registerProvider(new OpenAIImageProvider(openaiKey));
        }
        if (replicateToken) {
          this.imageGenManager.registerProvider(new ReplicateImageProvider(replicateToken));
        }
        this.logger.info(`Image generation initialized with providers: ${this.imageGenManager.listProviders().join(', ')}`);
      } else {
        this.logger.info('Image generation skipped: no OPENAI_API_KEY or REPLICATE_API_TOKEN in vault');
      }
    }

    // Initialize knowledge graph
    this.knowledgeGraph = new GraphStore();
    this.entityLinker = new EntityLinker();
    this.logger.info('Knowledge graph initialized');

    // Initialize code interpreter
    this.codeExecutor = new CodeExecutor();
    this.codeSessionManager = new CodeSessionManager(this.codeExecutor);
    this.logger.info('Code interpreter initialized');

    // Initialize notification orchestrator
    this.notificationHub = new NotificationHub();
    this.dndManager = new DoNotDisturbManager();
    this.notificationOrchestrator = new NotificationOrchestrator(
      this.notificationHub,
      this.dndManager,
      (notification) => {
        this.gateway.broadcast({
          type: 'notification',
          payload: { content: notification.message, system: true },
        });
        this.deliverToAllChannels(notification.message);
      },
    );
    this.logger.info('Notification orchestrator initialized');

    // Initialize autonomous workflow executor
    if (this.workflowEngine && this.trustGate && this.trustEngine && this.trustAuditTrail) {
      this.autonomousExecutor = new AutonomousExecutor({
        workflowEngine: this.workflowEngine,
        trustGate: this.trustGate,
        trustEngine: this.trustEngine,
        auditTrail: this.trustAuditTrail,
        executeTool: async (name, params) => {
          const context = {
            sessionId: 'autonomous',
            workingDirectory: getWorkspacePath(),
            timeout: 30000,
          };
          return toolExecutor.execute(name, params, context);
        },
        onWorkflowCompleted: (workflowId) => {
          const msg = `Autonomous workflow ${workflowId} completed`;
          this.gateway.broadcast({
            type: 'notification',
            payload: { content: msg, system: true },
          });
          this.deliverToAllChannels(msg);
        },
        onStepFailed: (workflowId, stepId, error) => {
          const msg = `Workflow ${workflowId} step ${stepId} failed: ${error}`;
          this.gateway.broadcast({
            type: 'notification',
            payload: { content: msg, system: true },
          });
          this.deliverToAllChannels(msg);
        },
      });
      this.autonomousExecutor.start(30_000);
      this.logger.info('Autonomous workflow executor started (30s tick)');
    }

    // Initialize connector registry and wire ambient scheduler
    this.connectorRegistry = new ConnectorRegistry();
    this.connectorAuthManager = new ConnectorAuthManager(this.vault);
    this.connectorRegistry.register(googleWorkspaceConnector);
    this.connectorRegistry.register(microsoftConnector);
    this.connectorRegistry.register(githubConnector);
    this.connectorRegistry.register(linearConnector);
    this.connectorRegistry.register(notionConnector);
    this.connectorRegistry.register(homeAssistantConnector);
    this.connectorRegistry.register(twitterConnector);
    this.connectorRegistry.register(linkedinConnector);
    this.connectorRegistry.register(redditConnector);
    this.connectorRegistry.register(instagramConnector);
    this.connectorRegistry.register(spotifyConnector);
    this.connectorRegistry.register(hueConnector);
    this.connectorRegistry.register(obsidianConnector);
    this.triggerManager = new TriggerManager(this.connectorRegistry, this.connectorAuthManager);

    // Restore connector tokens from vault (per-connector try-catch so one
    // failure doesn't prevent others from loading)
    for (const connector of this.connectorRegistry.list()) {
      try {
        const tokenData = this.vault.get(`connectors.${connector.id}.tokens`);
        if (tokenData) {
          const tokens = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
          await this.connectorAuthManager.authenticate(connector.id, connector.auth, tokens);
        }
      } catch (err) {
        this.logger.warn(`Failed to restore tokens for connector ${connector.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Register connector actions as AI-callable tools
    this.registerConnectorTools();

    // Wire ambient scheduler — always start it; connector-dependent features
    // (email/calendar) gracefully return empty when connectors aren't configured
    if (this.briefingGenerator) {
      const scheduler = new (await import('@auxiora/behaviors')).Scheduler();
      this.ambientScheduler = new AmbientScheduler({
        scheduler,
        connectorRegistry: this.connectorRegistry,
        triggerManager: this.triggerManager,
        briefingGenerator: this.briefingGenerator,
        notificationOrchestrator: this.notificationOrchestrator,
        deliveryChannel: async (msg: string) => {
          // Broadcast to all webchat connections
          this.gateway.broadcast({
            type: 'message',
            payload: { role: 'assistant', content: msg, system: true },
          });
          this.deliverToAllChannels(msg);
        },
        userId: 'default',
        config: DEFAULT_AMBIENT_SCHEDULER_CONFIG,
      });
      this.ambientScheduler.start();
      this.logger.info('Ambient scheduler started');
    }

    // Run pattern detection and persist to vault every 5 minutes
    const PATTERN_DETECT_INTERVAL = 5 * 60 * 1000;
    this.ambientDetectTimer = setInterval(async () => {
      // Poll triggers and route events
      if (this.triggerManager) {
        try {
          const events = await this.triggerManager.pollAll();
          await this.processEventTriggers(events);
        } catch { /* poll failure */ }
      }

      // Detect patterns and persist
      if (this.ambientEngine) {
        this.ambientEngine.detectPatterns();
        try {
          await this.vault.add('ambient:patterns', this.ambientEngine.serialize());
        } catch { /* vault locked */ }

        // Update awareness collector
        if (this.ambientAwarenessCollector) {
          this.ambientAwarenessCollector.updatePatterns(this.ambientEngine.getPatterns());
          if (this.anticipationEngine) {
            const anticipations = this.anticipationEngine.generateAnticipations(this.ambientEngine.getPatterns());
            this.ambientAwarenessCollector.updateAnticipations(anticipations);
          }
          this.ambientAwarenessCollector.updateActivity({
            eventRate: this.ambientEngine.getEventCount(),
            activeBehaviors: 0,
          });
        }
      }
    }, PATTERN_DETECT_INTERVAL);

    // [P15] Initialize conversation engine
    this.conversationEngine = new ConversationEngine();
    this.logger.info('Conversation engine initialized');

    // [P15] Initialize screen system (with mock backends — real backends injected at desktop layer)
    const mockCaptureBackend: CaptureBackend = {
      captureScreen: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
      captureRegion: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
      captureWindow: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
    };
    this.screenCapturer = new ScreenCapturer(mockCaptureBackend);
    this.logger.info('Screen system initialized (capture backend: mock)');

    // --- Self-awareness: capability catalog + health monitor ---
    const introspectionSources: IntrospectionSources = {
      getTools: () => toolRegistry.list(),
      getConnectedChannels: () => this.channels?.getConnectedChannels() ?? [],
      getConfiguredChannels: () => this.channels?.getConfiguredChannels() ?? [],
      getDefaultChannelId: (type) => this.channels?.getDefaultChannelId(type as any),
      getBehaviors: async () => this.behaviors?.list() ?? [],
      getProviders: () => {
        if (!this.providers) return [];
        const names = this.providers.listAvailable();
        return names.map((n) => {
          const p = this.providers!.getProvider(n);
          return { name: n, displayName: p.metadata.displayName, models: p.metadata.models };
        });
      },
      getPrimaryProviderName: () => this.config.provider.primary,
      getFallbackProviderName: () => this.config.provider.fallback,
      checkProviderAvailable: async (name) => {
        try {
          const p = this.providers?.getProvider(name);
          return p ? await p.metadata.isAvailable() : false;
        } catch { return false; }
      },
      getPlugins: () => (this.pluginLoader?.listPlugins() ?? []).map((p) => ({
        name: p.name, version: p.version, status: 'active',
        toolCount: p.toolCount, behaviorNames: p.behaviorNames,
      })),
      getFeatures: () => ({
        behaviors: !!this.behaviors,
        browser: !!this.browserManager,
        voice: !!this.voiceManager,
        webhooks: !!this.webhookManager,
        plugins: !!(this.pluginLoader && this.pluginLoader.listPlugins().length > 0),
        memory: !!this.memoryStore,
        research: !!this.researchEngine,
      }),
      getAuditEntries: async (limit) => {
        const al = getAuditLogger();
        return al.getEntries(limit);
      },
      getTrustLevel: (domain) => this.trustEngine?.getTrustLevel(domain as any) ?? 0,
    };

    this.capabilityCatalog = new CapabilityCatalogImpl(introspectionSources);
    await this.capabilityCatalog.rebuild();

    const initialHealth = { overall: 'healthy' as const, subsystems: [], issues: [], lastCheck: new Date().toISOString() };
    this.capabilityPromptFragment = generatePromptFragment(this.capabilityCatalog.getCatalog(), initialHealth, this.getSelfAwarenessContext());

    const autoFixActions: AutoFixActions = {
      reconnectChannel: async (type) => {
        if (!this.channels) return false;
        try {
          await this.channels.disconnect(type as any);
          await this.channels.connect(type as any);
          this.logger.info('Auto-fix: reconnected channel', { type });
          return true;
        } catch (err) {
          this.logger.warn('Auto-fix: channel reconnect failed', { type, error: err instanceof Error ? err : new Error(String(err)) });
          return false;
        }
      },
      restartBehavior: async (id) => {
        if (!this.behaviors) return false;
        try {
          const result = await this.behaviors.update(id, { status: 'active' });
          if (!result) return false;
          this.logger.info('Auto-fix: restarted behavior', { id });
          return true;
        } catch (err) {
          this.logger.warn('Auto-fix: behavior restart failed', { id, error: err instanceof Error ? err : new Error(String(err)) });
          return false;
        }
      },
      switchToFallbackProvider: async () => {
        const fallbackName = this.config.provider.fallback;
        if (!fallbackName) return false;
        const fallback = this.providers.getFallbackProvider();
        if (!fallback) return false;
        try {
          this.providers.setPrimary(fallbackName);
          this.logger.info('Auto-fix: switched to fallback provider', { name: fallbackName });
          return true;
        } catch (err) {
          this.logger.warn('Auto-fix: provider switch failed', { error: err instanceof Error ? err : new Error(String(err)) });
          return false;
        }
      },
    };

    this.healthMonitor = new HealthMonitorImpl(introspectionSources, autoFixActions);
    this.healthMonitor.onChange((state) => {
      this.capabilityPromptFragment = generatePromptFragment(this.capabilityCatalog!.getCatalog(), state, this.getSelfAwarenessContext());
      this.gateway.broadcast({ type: 'health_update', payload: state }, (client) => client.authenticated);
    });
    this.healthMonitor.start(30_000);

    const introspectTool = createIntrospectTool(
      () => this.capabilityCatalog!.getCatalog(),
      () => this.healthMonitor!.getHealthState(),
      introspectionSources,
    );
    toolRegistry.register(introspectTool as any);

    // Update catalog on relevant audit events
    const introspectionAuditLogger = getAuditLogger();
    const prevOnEntry = introspectionAuditLogger.onEntry;
    introspectionAuditLogger.onEntry = (entry) => {
      prevOnEntry?.(entry);
      if (entry.event.startsWith('channel.') || entry.event.startsWith('plugin.')) {
        this.capabilityCatalog?.rebuildSection(entry.event.startsWith('channel.') ? 'channels' : 'plugins');
      }
    };

    this.logger.info('Self-awareness initialized', {
      tools: this.capabilityCatalog.getCatalog().tools.length,
      channels: this.capabilityCatalog.getCatalog().channels.length,
    });
  }

  private async initializeProviders(): Promise<void> {
    let anthropicKey: string | undefined;
    let anthropicOAuthToken: string | undefined;
    let openaiKey: string | undefined;
    let googleKey: string | undefined;
    let groqKey: string | undefined;
    let deepseekKey: string | undefined;
    let cohereKey: string | undefined;
    let xaiKey: string | undefined;
    let replicateToken: string | undefined;
    let openrouterKey: string | undefined;
    let huggingfaceToken: string | undefined;
    let vaultLocked = false;

    try {
      anthropicKey = this.vault.get('ANTHROPIC_API_KEY');
      anthropicOAuthToken = this.vault.get('ANTHROPIC_OAUTH_TOKEN');
      openaiKey = this.vault.get('OPENAI_API_KEY');
      googleKey = this.vault.get('GOOGLE_API_KEY');
      groqKey = this.vault.get('GROQ_API_KEY');
      deepseekKey = this.vault.get('DEEPSEEK_API_KEY');
      cohereKey = this.vault.get('COHERE_API_KEY');
      xaiKey = this.vault.get('XAI_API_KEY');
      replicateToken = this.vault.get('REPLICATE_API_TOKEN');
      openrouterKey = this.vault.get('OPENROUTER_API_KEY');
      huggingfaceToken = this.vault.get('HUGGINGFACE_API_TOKEN');

      // Check if ANTHROPIC_API_KEY is actually an OAuth token (sk-ant-oat01-*)
      // This handles users who stored their OAuth token in the wrong vault key
      if (anthropicKey && isSetupToken(anthropicKey)) {
        anthropicOAuthToken = anthropicKey;
        anthropicKey = undefined;
      }
    } catch {
      vaultLocked = true;
    }

    // Initialize media processor with auto-detected providers
    // detectProviders() calls vault.get() — guard against locked vault
    try {
      this.mediaProcessor = new MediaProcessor(detectProviders(this.vault));
    } catch {
      this.mediaProcessor = new MediaProcessor([]);
    }

    // Check for Claude CLI credentials as fallback
    const cliCreds = readClaudeCliCredentials();
    const hasCliCredentials = cliCreds !== null;

    const hasAnthropic = anthropicKey || anthropicOAuthToken || hasCliCredentials;
    const hasOllama = this.config.provider.ollama?.model;
    const hasAnyKey = hasAnthropic || openaiKey || googleKey || groqKey || deepseekKey || cohereKey || xaiKey || replicateToken || hasOllama || openrouterKey || huggingfaceToken;
    if (!hasAnyKey) {
      if (vaultLocked) {
        this.logger.warn('Vault is locked. AI providers not initialized.');
        this.logger.warn('To use AI: auxiora vault add ANTHROPIC_API_KEY');
      } else {
        this.logger.warn('No API keys found in vault. Add with: auxiora vault add ANTHROPIC_API_KEY');
        this.logger.warn('Or for Claude Pro/Max OAuth: auxiora vault add ANTHROPIC_OAUTH_TOKEN');
        this.logger.warn('Or authenticate with: claude setup-token');
      }
      return;
    }

    // Build Anthropic config - prefer vault credentials, fall back to CLI
    let anthropicConfig: {
      apiKey?: string;
      oauthToken?: string;
      useCliCredentials?: boolean;
      onTokenRefresh?: () => Promise<string | null>;
      tokenExpiresAt?: number;
      model: string;
      maxTokens: number;
    } | undefined;

    if (anthropicOAuthToken) {
      const tokenPrefix = anthropicOAuthToken.substring(0, 15);
      this.logger.info(`Using Anthropic OAuth token from vault (${tokenPrefix}...)`);
      const vault = this.vault;
      const expiresAtStr = vault.get('CLAUDE_OAUTH_EXPIRES_AT');
      const tokenExpiresAt = expiresAtStr ? Number(expiresAtStr) : undefined;
      if (tokenExpiresAt) {
        const minutesLeft = Math.round((tokenExpiresAt - Date.now()) / 60000);
        this.logger.info(`OAuth token expires in ${minutesLeft} minutes`);
      }
      anthropicConfig = {
        oauthToken: anthropicOAuthToken,
        tokenExpiresAt,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
        onTokenRefresh: async () => {
          const rt = vault.get('CLAUDE_OAUTH_REFRESH_TOKEN');
          if (!rt) {
            this.logger.warn('No refresh token in vault — cannot auto-refresh. Re-authenticate via Dashboard > Settings > Provider.');
            return null;
          }
          this.logger.info('Attempting OAuth token refresh...');
          // Try PKCE client first (dashboard OAuth flow), then CLI client
          const methods = [
            { name: 'PKCE', fn: refreshPKCEOAuthToken },
            { name: 'CLI', fn: refreshOAuthToken },
          ];
          for (const method of methods) {
            try {
              const refreshed = await method.fn(rt);
              await vault.add('ANTHROPIC_OAUTH_TOKEN', refreshed.accessToken);
              await vault.add('CLAUDE_OAUTH_REFRESH_TOKEN', refreshed.refreshToken);
              await vault.add('CLAUDE_OAUTH_EXPIRES_AT', String(refreshed.expiresAt));
              this.logger.info(`OAuth token refreshed via ${method.name} client`);
              return refreshed.accessToken;
            } catch (err) {
              this.logger.warn(`${method.name} token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          this.logger.error('All token refresh methods failed. Re-authenticate via Dashboard > Settings > Provider.', { error: new Error('Token refresh exhausted') });
          return null;
        },
      };
    } else if (anthropicKey) {
      this.logger.info('Using Anthropic API key from vault');
      anthropicConfig = {
        apiKey: anthropicKey,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    } else if (hasCliCredentials) {
      this.logger.info('Using Claude CLI credentials (~/.claude/.credentials.json)');
      anthropicConfig = {
        useCliCredentials: true,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    }

    this.providers = new ProviderFactory({
      primary: this.config.provider.primary,
      fallback: this.config.provider.fallback,
      config: {
        anthropic: anthropicConfig,
        openai: openaiKey
          ? {
              apiKey: openaiKey,
              model: this.config.provider.openai.model,
              maxTokens: this.config.provider.openai.maxTokens,
            }
          : undefined,
        google: googleKey
          ? {
              apiKey: googleKey,
              model: this.config.provider.google.model,
              maxTokens: this.config.provider.google.maxTokens,
            }
          : undefined,
        ollama: {
          baseUrl: this.config.provider.ollama.baseUrl,
          model: this.config.provider.ollama.model,
          maxTokens: this.config.provider.ollama.maxTokens,
        },
        openaiCompatible: this.config.provider.openaiCompatible.baseUrl
          ? {
              baseUrl: this.config.provider.openaiCompatible.baseUrl,
              model: this.config.provider.openaiCompatible.model,
              maxTokens: this.config.provider.openaiCompatible.maxTokens,
              name: this.config.provider.openaiCompatible.name,
            }
          : undefined,
        groq: groqKey
          ? {
              apiKey: groqKey,
              model: this.config.provider.groq.model,
              maxTokens: this.config.provider.groq.maxTokens,
            }
          : undefined,
        deepseek: deepseekKey
          ? {
              apiKey: deepseekKey,
              model: this.config.provider.deepseek.model,
              maxTokens: this.config.provider.deepseek.maxTokens,
            }
          : undefined,
        cohere: cohereKey
          ? {
              apiKey: cohereKey,
              model: this.config.provider.cohere.model,
              maxTokens: this.config.provider.cohere.maxTokens,
            }
          : undefined,
        xai: xaiKey
          ? {
              apiKey: xaiKey,
              model: this.config.provider.xai.model,
              maxTokens: this.config.provider.xai.maxTokens,
            }
          : undefined,
        replicate: replicateToken
          ? {
              apiToken: replicateToken,
              model: this.config.provider.replicate.model,
            }
          : undefined,
      },
    });

    // Register dynamic providers (OpenRouter, HuggingFace) after factory construction
    if (openrouterKey) {
      try {
        const { OpenRouterProvider } = await import('@auxiora/provider-openrouter');
        const openrouter = new OpenRouterProvider({
          apiKey: openrouterKey,
          model: this.config.provider.openrouter?.model,
          maxTokens: this.config.provider.openrouter?.maxTokens,
          appName: this.config.provider.openrouter?.appName,
        });
        this.providers.register('openrouter', openrouter);
        this.logger.info('OpenRouter provider registered');
      } catch (err) {
        this.logger.warn('Failed to load OpenRouter provider', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }

    if (huggingfaceToken) {
      try {
        const { HuggingFaceProvider } = await import('@auxiora/provider-huggingface');
        const hf = new HuggingFaceProvider({
          apiKey: huggingfaceToken,
          model: this.config.provider.huggingface?.model,
          maxTokens: this.config.provider.huggingface?.maxTokens,
          preferredInferenceProvider: this.config.provider.huggingface?.preferredInferenceProvider,
        });
        this.providers.register('huggingface', hf);
        this.logger.info('HuggingFace provider registered');
      } catch (err) {
        this.logger.warn('Failed to load HuggingFace provider', { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  }

  private initializeRouter(): void {
    // Gather provider metadata from available providers
    const availableProviders = new Map<string, ProviderMetadata>();
    for (const name of this.providers.listAvailable()) {
      const provider = this.providers.getProvider(name);
      if (provider.metadata) {
        availableProviders.set(name, provider.metadata);
      }
    }

    if (availableProviders.size === 0) return;

    const classifier = new TaskClassifier();
    const selector = new ModelSelector(availableProviders, this.config.routing);
    const costTracker = new CostTracker(this.config.routing.costLimits);
    this.modelRouter = new ModelRouter(classifier, selector, costTracker, availableProviders);
    this.logger.info(`Model router initialized with ${availableProviders.size} provider(s)`);
  }

  getRouter(): ModelRouter | undefined {
    return this.modelRouter;
  }

  getModelRegistry(): import('@auxiora/model-registry').ModelRegistry | undefined {
    return this.modelRegistry;
  }

  getOrchestrationEngine(): OrchestrationEngine | undefined {
    return this.orchestrationEngine;
  }

  getCostSummary() {
    return this.modelRouter?.getCostSummary();
  }

  private async initializeChannels(): Promise<void> {
    // Get channel tokens from vault
    let discordToken: string | undefined;
    let telegramToken: string | undefined;
    let slackBotToken: string | undefined;
    let slackAppToken: string | undefined;
    let twilioAccountSid: string | undefined;
    let twilioAuthToken: string | undefined;
    let twilioPhoneNumber: string | undefined;
    let emailAddress: string | undefined;
    let emailPassword: string | undefined;
    let emailImapHost: string | undefined;
    let emailImapPort: string | undefined;
    let emailSmtpHost: string | undefined;
    let emailSmtpPort: string | undefined;
    let matrixAccessToken: string | undefined;
    let matrixHomeserverUrl: string | undefined;
    let matrixUserId: string | undefined;
    let signalCliEndpoint: string | undefined;
    let signalPhoneNumber: string | undefined;
    let teamsAppId: string | undefined;
    let teamsAppPassword: string | undefined;
    let whatsappPhoneNumberId: string | undefined;
    let whatsappAccessToken: string | undefined;
    let whatsappVerifyToken: string | undefined;

    try {
      discordToken = this.vault.get('DISCORD_BOT_TOKEN');
      telegramToken = this.vault.get('TELEGRAM_BOT_TOKEN');
      slackBotToken = this.vault.get('SLACK_BOT_TOKEN');
      slackAppToken = this.vault.get('SLACK_APP_TOKEN');
      twilioAccountSid = this.vault.get('TWILIO_ACCOUNT_SID');
      twilioAuthToken = this.vault.get('TWILIO_AUTH_TOKEN');
      twilioPhoneNumber = this.vault.get('TWILIO_PHONE_NUMBER');
      emailAddress = this.vault.get('EMAIL_ADDRESS');
      emailPassword = this.vault.get('EMAIL_PASSWORD');
      emailImapHost = this.vault.get('EMAIL_IMAP_HOST');
      emailImapPort = this.vault.get('EMAIL_IMAP_PORT');
      emailSmtpHost = this.vault.get('EMAIL_SMTP_HOST');
      emailSmtpPort = this.vault.get('EMAIL_SMTP_PORT');
      matrixAccessToken = this.vault.get('MATRIX_ACCESS_TOKEN');
      matrixHomeserverUrl = this.vault.get('MATRIX_HOMESERVER_URL');
      matrixUserId = this.vault.get('MATRIX_USER_ID');
      signalCliEndpoint = this.vault.get('SIGNAL_CLI_ENDPOINT');
      signalPhoneNumber = this.vault.get('SIGNAL_PHONE_NUMBER');
      teamsAppId = this.vault.get('TEAMS_APP_ID');
      teamsAppPassword = this.vault.get('TEAMS_APP_PASSWORD');
      whatsappPhoneNumberId = this.vault.get('WHATSAPP_PHONE_NUMBER_ID');
      whatsappAccessToken = this.vault.get('WHATSAPP_ACCESS_TOKEN');
      whatsappVerifyToken = this.vault.get('WHATSAPP_VERIFY_TOKEN');
    } catch {
      // Vault is locked
      return;
    }

    const hasAnyChannel =
      (this.config.channels.discord.enabled && discordToken) ||
      (this.config.channels.telegram.enabled && telegramToken) ||
      (this.config.channels.slack.enabled && slackBotToken && slackAppToken) ||
      (this.config.channels.twilio.enabled && twilioAccountSid && twilioAuthToken) ||
      (this.config.channels.email.enabled && emailAddress && emailPassword && emailImapHost && emailSmtpHost) ||
      (this.config.channels.matrix.enabled && matrixAccessToken && matrixHomeserverUrl) ||
      (this.config.channels.signal.enabled && signalCliEndpoint && signalPhoneNumber) ||
      (this.config.channels.teams.enabled && teamsAppId && teamsAppPassword) ||
      (this.config.channels.whatsapp.enabled && whatsappPhoneNumberId && whatsappAccessToken && whatsappVerifyToken);

    if (!hasAnyChannel) {
      return;
    }

    this.channels = new ChannelManager({
      discord:
        this.config.channels.discord.enabled && discordToken
          ? {
              token: discordToken,
              mentionOnly: this.config.channels.discord.mentionOnly,
            }
          : undefined,
      telegram:
        this.config.channels.telegram.enabled && telegramToken
          ? {
              token: telegramToken,
            }
          : undefined,
      slack:
        this.config.channels.slack.enabled && slackBotToken && slackAppToken
          ? {
              botToken: slackBotToken,
              appToken: slackAppToken,
            }
          : undefined,
      twilio:
        this.config.channels.twilio.enabled && twilioAccountSid && twilioAuthToken && twilioPhoneNumber
          ? {
              accountSid: twilioAccountSid,
              authToken: twilioAuthToken,
              phoneNumber: twilioPhoneNumber,
            }
          : undefined,
      email:
        this.config.channels.email.enabled && emailAddress && emailPassword && emailImapHost && emailSmtpHost
          ? {
              imapHost: emailImapHost,
              imapPort: Number(emailImapPort) || 993,
              smtpHost: emailSmtpHost,
              smtpPort: Number(emailSmtpPort) || 465,
              email: emailAddress,
              password: emailPassword,
              pollInterval: this.config.channels.email.pollInterval,
            }
          : undefined,
      matrix:
        this.config.channels.matrix.enabled && matrixAccessToken && matrixHomeserverUrl && matrixUserId
          ? {
              homeserverUrl: matrixHomeserverUrl,
              userId: matrixUserId,
              accessToken: matrixAccessToken,
              autoJoinRooms: this.config.channels.matrix.autoJoinRooms,
            }
          : undefined,
      signal:
        this.config.channels.signal.enabled && signalCliEndpoint && signalPhoneNumber
          ? {
              signalCliEndpoint,
              phoneNumber: signalPhoneNumber,
            }
          : undefined,
      teams:
        this.config.channels.teams.enabled && teamsAppId && teamsAppPassword
          ? {
              microsoftAppId: teamsAppId,
              microsoftAppPassword: teamsAppPassword,
            }
          : undefined,
      whatsapp:
        this.config.channels.whatsapp.enabled && whatsappPhoneNumberId && whatsappAccessToken && whatsappVerifyToken
          ? {
              phoneNumberId: whatsappPhoneNumberId,
              accessToken: whatsappAccessToken,
              verifyToken: whatsappVerifyToken,
            }
          : undefined,
    });

    // Set up channel message handler
    this.channels.onMessage(this.handleChannelMessage.bind(this));
    this.channels.onError((error, channelType) => {
      this.logger.error('Channel error', { channelType, error: new Error(error.message) });
    });

    if (this.pluginLoader) {
      this.pluginLoader.setChannelManager(this.channels);
    }
  }

  private async reinitializeChannels(): Promise<void> {
    // Disconnect existing channels gracefully
    if (this.channels) {
      try {
        await this.channels.disconnectAll();
      } catch (error) {
        this.logger.warn('Error disconnecting channels during reinit', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      this.channels = undefined;
    }

    // Re-initialize with updated config and vault
    await this.initializeChannels();

    // Connect the newly initialized channels (cast needed: initializeChannels may set this.channels)
    const channels = this.channels as ChannelManager | undefined;
    if (channels) {
      try {
        await channels.connectAll();
        const connected = channels.getConnectedChannels();
        if (connected.length > 0) {
          this.logger.info(`Channels reconnected: ${connected.join(', ')}`);
        }
      } catch (error) {
        this.logger.warn('Some channels failed to connect during reinit', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  private buildIdentityPreamble(agent: AgentIdentity): string {
    const lines: string[] = ['# Agent Identity'];
    lines.push(`You are ${agent.name} (${agent.pronouns}).`);

    lines.push('');
    lines.push('## Personality');
    lines.push(
      `Warmth: ${agent.tone.warmth}/1.0 | Directness: ${agent.tone.directness}/1.0 | Humor: ${agent.tone.humor}/1.0 | Formality: ${agent.tone.formality}/1.0`,
    );
    lines.push(`Error handling style: ${agent.errorStyle}`);

    if (agent.expertise.length > 0) {
      lines.push('');
      lines.push('## Expertise');
      for (const area of agent.expertise) {
        lines.push(`- ${area}`);
      }
    }

    const phrases = Object.entries(agent.catchphrases).filter(([, v]) => v);
    if (phrases.length > 0) {
      lines.push('');
      lines.push('## Catchphrases');
      for (const [key, value] of phrases) {
        lines.push(`- ${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
      }
    }

    const hasJokeBoundaries = agent.boundaries.neverJokeAbout.length > 0;
    const hasAdviseBoundaries = agent.boundaries.neverAdviseOn.length > 0;
    if (hasJokeBoundaries || hasAdviseBoundaries) {
      lines.push('');
      lines.push('## Boundaries');
      if (hasJokeBoundaries) {
        lines.push(`Never joke about: ${agent.boundaries.neverJokeAbout.join(', ')}`);
      }
      if (hasAdviseBoundaries) {
        lines.push(`Never advise on: ${agent.boundaries.neverAdviseOn.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  private async loadArchitectPersonality(): Promise<void> {
    // Identity preamble first so the AI knows its configured name (e.g. "Aria")
    const agent = this.config.agent;
    const parts: string[] = [this.buildIdentityPreamble(agent), ARCHITECT_BASE_PROMPT];

    // Workspace files still provide user context
    try { parts.push(await fs.readFile(getAgentsPath(), 'utf-8')); } catch { /* no file */ }
    try { parts.push(await fs.readFile(getIdentityPath(), 'utf-8')); } catch { /* no file */ }
    try {
      const user = await fs.readFile(getUserPath(), 'utf-8');
      parts.push(`\n## About the User\n${user}`);
    } catch { /* no file */ }

    this.architectPrompt = parts.join('\n\n---\n\n');
    const storage = new VaultStorageAdapter(this.vault);
    this.architect = createArchitect(storage);
    await this.architect.initialize();

    if (this.capabilityPromptFragment) {
      this.architectPrompt += '\n\n---\n\n' + this.capabilityPromptFragment;
    }
  }

  private async loadPersonality(): Promise<void> {
    // Always initialize Architect engine (it's lightweight) so any chat can use it.
    // Wrap in try/catch: vault may be locked during setup mode.
    try {
      await this.loadArchitectPersonality();
    } catch {
      this.logger.warn('Architect personality not available (vault may be locked)');
    }

    // Initialize Architect bridge for state persistence and awareness bridging
    if (this.architect) {
      this.architectAwarenessCollector = new ArchitectAwarenessCollector();
      this.architectBridge = new ArchitectBridge(
        this.architect,
        this.architectAwarenessCollector,
        this.vault,
        {
          onEscalation: (alert, context) => {
            this.logger.warn('Escalation detected', {
              alert,
              domain: context.domain,
              emotion: context.emotionalRegister,
            });
          },
        },
      );
    }

    // Build standard prompt
    const parts: string[] = [];

    // Build identity preamble from config
    const agent = this.config.agent;
    parts.push(this.buildIdentityPreamble(agent));

    // Add personality adaptations from living memory
    if (this.personalityAdapter) {
      const modifier = await this.personalityAdapter.getPromptModifier();
      if (modifier) {
        parts.push(modifier);
      }
    }

    // Load SOUL.md
    let soulContent: string | undefined;
    try {
      soulContent = await fs.readFile(getSoulPath(), 'utf-8');
      parts.push(soulContent);
    } catch {
      // No SOUL.md
    }

    // Apply SOUL.md domain biases to Architect trait mixing
    if (this.architect && soulContent) {
      const biases = parseSoulBiases(soulContent);
      for (const [trait, offset] of Object.entries(biases)) {
        this.architect.setTraitOverride(trait as any, offset).catch(() => {});
      }
    }

    // Load AGENTS.md
    try {
      const agents = await fs.readFile(getAgentsPath(), 'utf-8');
      parts.push(agents);
    } catch {
      // No AGENTS.md
    }

    // Load IDENTITY.md
    try {
      const identity = await fs.readFile(getIdentityPath(), 'utf-8');
      parts.push(identity);
    } catch {
      // No IDENTITY.md
    }

    // Load USER.md
    try {
      const user = await fs.readFile(getUserPath(), 'utf-8');
      parts.push(`\n## About the User\n${user}`);
    } catch {
      // No USER.md
    }

    if (parts.length > 1) {
      // Has content beyond the identity preamble
      this.standardPrompt = parts.join('\n\n---\n\n');
    } else {
      // Only identity preamble, no personality files — use enriched default
      this.standardPrompt = `You are ${agent.name}, a helpful AI assistant. Be concise, accurate, and friendly.`;
    }

    // Append tool usage guidance
    this.standardPrompt += '\n\n---\n\n## Tool Usage\n'
      + '- For reading web pages, searching, fetching articles, or looking up information, use the `web_browser` tool. It is fast, lightweight, and always available.\n'
      + '- Only use `browser_navigate` and other browser_* tools when you need JavaScript rendering or interactive features (clicking buttons, filling forms, taking screenshots).\n'
      + '- Never expose raw tool errors to the user. If a tool fails, explain the situation naturally.';

    // Append self-awareness capability fragment
    if (this.capabilityPromptFragment) {
      this.standardPrompt += '\n\n---\n\n' + this.capabilityPromptFragment;
    }

    // Set global system prompt based on config
    this.systemPrompt = this.config.agent.personality === 'the-architect'
      ? this.architectPrompt
      : this.standardPrompt;

    // Initialize dynamic self-awareness assembler
    if (this.config.selfAwareness?.enabled) {
      const storage = new InMemoryAwarenessStorage();
      const collectorConfig = this.config.selfAwareness.collectors ?? {};
      const collectors: SignalCollector[] = [
        ...(collectorConfig.conversationReflector !== false ? [new ConversationReflector(storage)] : []),
        ...(collectorConfig.capacityMonitor !== false ? [new CapacityMonitor()] : []),
        ...(collectorConfig.knowledgeBoundary !== false ? [new KnowledgeBoundary(storage)] : []),
        ...(collectorConfig.relationshipModel !== false ? [new RelationshipModel(storage)] : []),
        ...(collectorConfig.temporalTracker !== false ? [new TemporalTracker(storage)] : []),
        ...(collectorConfig.environmentSensor !== false ? [new EnvironmentSensor()] : []),
        ...(collectorConfig.metaCognitor !== false ? [new MetaCognitor(storage)] : []),
      ];
      if (this.architectAwarenessCollector) {
        collectors.push(this.architectAwarenessCollector);
      }
      if (this.ambientAwarenessCollector) {
        collectors.push(this.ambientAwarenessCollector);
      }
      this.selfAwarenessAssembler = new SelfAwarenessAssembler(collectors, {
        tokenBudget: this.config.selfAwareness.tokenBudget ?? 500,
      });
    }
  }

  /** Switch the global personality engine at runtime (no restart required). */
  setPersonalityEngine(engine: string): void {
    this.config.agent.personality = engine;
    this.systemPrompt = engine === 'the-architect'
      ? this.architectPrompt
      : this.standardPrompt;
    // Rebuild self-awareness fragment so the AI knows its personality changed
    if (this.capabilityCatalog && this.healthMonitor) {
      this.capabilityPromptFragment = generatePromptFragment(
        this.capabilityCatalog.getCatalog(),
        this.healthMonitor.getHealthState(),
        this.getSelfAwarenessContext(),
      );
    }
  }

  private getSelfAwarenessContext(): SelfAwarenessContext {
    const primary = this.config.provider.primary;
    // Read model directly from the live provider instance — this is the actual
    // model being used, not just what the config file says.
    const provider = this.providers.getPrimaryProvider();
    return {
      defaultModel: provider.defaultModel,
      primaryProvider: primary,
      personalityEngine: this.config.agent.personality ?? 'standard',
    };
  }

  private async getCachedSelfModel(): Promise<SelfModelSnapshot | null> {
    if (!this.consciousness) return null;
    const now = Date.now();
    if (this.selfModelCache && (now - this.selfModelCache.cachedAt) < Auxiora.MODEL_CACHE_TTL) {
      return this.selfModelCache.snapshot;
    }
    try {
      const snapshot = await this.consciousness.model.synthesize();
      this.selfModelCache = { snapshot, cachedAt: now };
      return snapshot;
    } catch {
      return this.selfModelCache?.snapshot ?? null;
    }
  }

  private getCachedUserModel(): UserModel | null {
    if (!this.architect) return null;
    const now = Date.now();
    if (this.userModelCache && (now - this.userModelCache.cachedAt) < Auxiora.MODEL_CACHE_TTL) {
      return this.userModelCache.model;
    }
    try {
      const model = this.architect.getUserModel();
      this.userModelCache = { model, cachedAt: now };
      return model;
    } catch {
      return this.userModelCache?.model ?? null;
    }
  }

  private async initializeModes(): Promise<void> {
    if (this.config.modes?.enabled === false) return;

    const builtInModesDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../personality/modes',
    );
    const userModesDir = getModesDir();

    this.modeLoader = new ModeLoader(builtInModesDir, userModesDir);
    await this.modeLoader.loadAll();

    this.modeDetector = new ModeDetector(this.modeLoader.getAll());

    this.promptAssembler = new PromptAssembler(
      this.config.agent,
      this.modeLoader,
      this.personalityAdapter ?? undefined,
    );
    await this.promptAssembler.buildBase();

    this.userPreferences = this.config.modes?.preferences;
    this.securityFloor = new SecurityFloor();
  }

  private getSessionModeState(sessionId: string): SessionModeState {
    let state = this.sessionModes.get(sessionId);
    if (!state) {
      const defaultMode = this.config.modes?.defaultMode ?? 'auto';
      state = { activeMode: defaultMode, autoDetected: false };
      this.sessionModes.set(sessionId, state);
    }
    return state;
  }

  private buildEnrichmentPipeline(): void {
    this.enrichmentPipeline = new EnrichmentPipeline();

    // Stage 0: Telemetry warnings (order 50) — injects operational insights before everything
    if (this.telemetryTracker) {
      const tracker = this.telemetryTracker;
      this.enrichmentPipeline.addStage(new TelemetryStage(
        () => tracker.getFlaggedTools(0.7, 5),
      ));
    }

    // Group context (order 150) — self-gates via enabled()
    this.enrichmentPipeline.addStage(new GroupContextStage());

    // Stage 1: Memory (order 100)
    if (this.memoryStore && this.memoryRetriever) {
      this.enrichmentPipeline.addStage(new MemoryStage(this.memoryStore, this.memoryRetriever));
    }

    // Stage 2: Mode detection + security (order 200)
    if (this.modeDetector && this.promptAssembler) {
      this.enrichmentPipeline.addStage(new ModeStage({
        detector: this.modeDetector,
        assembler: this.promptAssembler,
        securityFloor: this.securityFloor,
        userPreferences: this.userPreferences,
        getModeState: (sessionId: string) => this.getSessionModeState(sessionId),
      }));
    }

    // Stage 3: Architect (order 300)
    if (this.architect) {
      this.enrichmentPipeline.addStage(new ArchitectStage(
        this.architect,
        this.architectBridge ?? undefined,
        this.architectAwarenessCollector ?? undefined,
        () => this.getCachedSelfModel(),
        () => this.getCachedUserModel(),
      ));
    }

    // Stage 4: Self-awareness (order 400)
    if (this.selfAwarenessAssembler) {
      this.enrichmentPipeline.addStage(new SelfAwarenessStage(this.selfAwarenessAssembler));
    }
  }

  private readonly GUARDRAIL_BLOCK_MESSAGE = 'I\'m not able to process that request. If you believe this is an error, please rephrase your message.';

  private buildModelIdentityFragment(provider: Provider, model?: string): string {
    const activeModel = model ?? provider.defaultModel;
    const caps = provider.metadata.models[activeModel];
    return '\n\n[Model Identity]\n'
      + `You are running as ${activeModel} via ${provider.metadata.displayName}.`
      + (this.auxioraVersion ? ` Auxiora version: ${this.auxioraVersion}.` : '')
      + (caps ? ` Context window: ${caps.maxContextTokens.toLocaleString()} tokens.` : '')
      + (caps?.supportsVision ? ' You have vision capabilities.' : '')
      + ` Today's date: ${new Date().toISOString().slice(0, 10)}.`;
  }

  private checkInputGuardrails(content: string): ScanResult | null {
    if (!this.guardrailPipeline) return null;
    const result = this.guardrailPipeline.scanInput(content);
    if (result.action !== 'allow') {
      this.logger.debug('Input guardrail triggered', { action: result.action, threatCount: result.threats.length });
    }
    return result;
  }

  private checkOutputGuardrails(response: string): { response: string; wasModified: boolean; action: string } {
    if (!this.guardrailPipeline || this.config.guardrails?.scanOutput === false || !response) {
      return { response, wasModified: false, action: 'allow' };
    }
    const result = this.guardrailPipeline.scanOutput(response);
    if (result.action === 'block') {
      return { response: this.GUARDRAIL_BLOCK_MESSAGE, wasModified: true, action: 'block' };
    }
    if (result.action === 'redact' && result.redactedContent) {
      return { response: result.redactedContent, wasModified: true, action: 'redact' };
    }
    return { response, wasModified: false, action: result.action };
  }

  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const { id: requestId, payload } = message;

    // Handle architect correction messages (learning engine)
    if (message.type === 'architect_correction') {
      const corrPayload = payload as { userMessage?: string; detectedDomain?: string; correctedDomain?: string } | undefined;
      if (this.architect && corrPayload?.userMessage && corrPayload.detectedDomain && corrPayload.correctedDomain) {
        await this.architect.recordCorrection(
          corrPayload.userMessage,
          corrPayload.detectedDomain as import('@auxiora/personality/architect').ContextDomain,
          corrPayload.correctedDomain as import('@auxiora/personality/architect').ContextDomain,
        );
      }
      return;
    }

    // Handle message feedback (thumbs up/down for Architect learning)
    if (message.type === 'message_feedback') {
      const fbPayload = payload as { messageId?: string; sessionId?: string; rating?: 'up' | 'down'; note?: string } | undefined;
      if (this.architect && fbPayload?.messageId && fbPayload?.rating) {
        // Look up the message to get architectDomain from metadata
        let domain = 'general';
        if (fbPayload.sessionId) {
          const msgs = this.sessions.getMessages(fbPayload.sessionId);
          const msg = msgs.find((m: Message) => m.id === fbPayload.messageId);
          if (msg?.metadata?.architectDomain) {
            domain = msg.metadata.architectDomain as string;
          }
        }
        const mapped = fbPayload.rating === 'up' ? 'helpful' : 'off_target';
        await this.architect.recordFeedback({
          domain: domain as import('@auxiora/personality/architect').ContextDomain,
          rating: mapped,
          note: fbPayload.note,
        });
        audit('personality.feedback', {
          sessionId: fbPayload.sessionId,
          messageId: fbPayload.messageId,
          rating: fbPayload.rating,
        });
      }
      return;
    }

    // Handle deep research job requests
    if (message.type === 'start_research') {
      const researchPayload = payload as { question?: string; depth?: 'quick' | 'standard' | 'deep' } | undefined;
      if (researchPayload?.question) {
        const job: ResearchJob = {
          id: crypto.randomUUID(),
          question: researchPayload.question,
          depth: researchPayload.depth ?? 'deep',
          status: 'planning',
          createdAt: Date.now(),
          progress: [],
        };
        this.researchJobs.set(job.id, job);
        audit('research.started', { jobId: job.id, question: job.question, depth: job.depth });
        this.sendToClient(client, { type: 'research_started', id: requestId, payload: { jobId: job.id } });
        this.runResearchJob(job, client).catch((err) => {
          job.status = 'failed';
          this.logger.error('Research job failed', { error: err instanceof Error ? err : new Error(String(err)), jobId: job.id });
        });
      }
      return;
    }

    const msgPayload = payload as { content?: string; model?: string; provider?: string; thinkingLevel?: ThinkingLevel; chatId?: string } | undefined;
    const content = msgPayload?.content;
    const modelOverride = msgPayload?.model;
    const providerOverride = msgPayload?.provider;
    const thinkingLevel = msgPayload?.thinkingLevel;
    const chatId = msgPayload?.chatId;

    if (!content || typeof content !== 'string') {
      this.sendToClient(client, {
        type: 'error',
        id: requestId,
        payload: { message: 'Missing message content' },
      });
      return;
    }

    // ── Research intent detection ──────────────────────────────────
    const researchIntent = this.intentDetector.detect(content);
    if (researchIntent.score >= 0.6) {
      this.sendToClient(client, { type: 'research_suggestion', id: requestId, payload: researchIntent });
    }

    // ── Guardrail input scan ──────────────────────────────────────
    const inputScan = this.checkInputGuardrails(content);
    if (inputScan && inputScan.action === 'block') {
      audit('guardrail.triggered', {
        action: 'block',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: 'webchat',
      });
      this.sendToClient(client, {
        type: 'message',
        id: requestId,
        payload: { role: 'assistant', content: this.GUARDRAIL_BLOCK_MESSAGE },
      });
      this.sendToClient(client, { type: 'done', id: requestId, payload: {} });
      return;
    }

    // Handle commands
    if (content.startsWith('/')) {
      await this.handleCommand(client, content, requestId);
      return;
    }

    // Get or create session — use chatId if provided (multi-chat), otherwise legacy behavior
    let session;
    if (chatId) {
      const existing = await this.sessions.get(chatId);
      if (existing) {
        session = existing;
      } else {
        session = await this.sessions.create({ channelType: 'webchat', clientId: client.id });
        this.sendToClient(client, {
          type: 'chat_created',
          id: requestId,
          payload: { chatId: session.id },
        });
      }
    } else {
      session = await this.sessions.getOrCreate(client.id, {
        channelType: client.channelType,
        clientId: client.id,
        senderId: client.senderId,
      });
    }

    // Apply redaction if guardrails flagged PII
    let processedContent = content;
    if (inputScan?.action === 'redact' && inputScan.redactedContent) {
      processedContent = inputScan.redactedContent;
      audit('guardrail.triggered', {
        action: 'redact',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: 'webchat',
        sessionId: session.id,
      });
    } else if (inputScan?.action === 'warn') {
      audit('guardrail.triggered', {
        action: 'warn',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: 'webchat',
        sessionId: session.id,
      });
    }

    // Add user message
    await this.sessions.addMessage(session.id, 'user', processedContent);

    // Check if providers are available
    if (!this.providers) {
      this.sendToClient(client, {
        type: 'message',
        id: requestId,
        payload: {
          role: 'assistant',
          content:
            'I need API keys to respond. Please add them:\n\n```\nauxiora vault add ANTHROPIC_API_KEY\n```',
        },
      });
      return;
    }

    // Get context messages
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
      4096,
    );
    const chatMessages = sanitizeTranscript(contextMessages).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Resolve per-chat personality (metadata overrides global default)
      const chatRecord = chatId ? this.sessions.getChat(chatId) : undefined;
      const chatPersonality = chatRecord?.metadata?.personality as string | undefined;
      const useArchitect = chatPersonality
        ? chatPersonality === 'the-architect'
        : this.config.agent.personality === 'the-architect';
      const basePrompt = useArchitect ? this.architectPrompt : this.standardPrompt;

      // Build enriched prompt through pipeline
      let enrichedPrompt = basePrompt;
      let architectResult: { prompt: string; architectMeta?: any } = { prompt: basePrompt };

      // Reset Architect conversation state for new chats
      if (useArchitect && this.architect && chatId && !this.architectResetChats.has(chatId)) {
        this.architectResetChats.add(chatId);
        this.architect.resetConversation();
        audit('personality.reset', { sessionId: session.id, chatId });
      }

      if (this.enrichmentPipeline) {
        const enrichCtx: EnrichmentContext = {
          basePrompt,
          userMessage: processedContent,
          history: contextMessages,
          channelType: 'webchat',
          chatId: chatId ?? session.id,
          sessionId: session.id,
          userId: client.senderId ?? 'anonymous',
          toolsUsed: this.lastToolsUsed.get(session.id) ?? [],
          config: this.config,
        };
        const result = await this.enrichmentPipeline.run(enrichCtx);
        enrichedPrompt = result.prompt;
        architectResult = { prompt: enrichedPrompt, architectMeta: result.metadata.architect };
      }

      // Route to best model for this message
      let provider;
      let routingResult: RoutingResult | undefined;

      if (providerOverride || modelOverride) {
        // Manual override — skip router
        provider = this.providers.getProvider(providerOverride || this.config.provider.primary);
      } else if (this.modelRouter && this.config.routing?.enabled !== false) {
        try {
          routingResult = this.modelRouter.route(processedContent, { hasImages: false });
          provider = this.providers.getProvider(routingResult.selection.provider);
        } catch {
          provider = this.providers.getPrimaryProvider();
        }
      } else {
        provider = this.providers.getPrimaryProvider();
      }

      // Inject model identity so the AI knows what it's running on
      enrichedPrompt += this.buildModelIdentityFragment(
        provider,
        routingResult?.selection.model ?? modelOverride,
      );

      // Execute streaming AI call with tool follow-up loop
      const processingStartTime = Date.now();
      const fallbackCandidates = this.providers.resolveFallbackCandidates();
      const toolsUsed: Array<{ name: string; success: boolean }> = [];
      let streamChunkCount = 0;
      const { response: fullResponse, usage } = await this.executeWithTools(
        session.id,
        chatMessages,
        enrichedPrompt,
        provider,
        (type, data) => {
          if (type === 'text') {
            streamChunkCount++;
            this.sendToClient(client, { type: 'chunk', id: requestId, payload: { content: data } });
          } else if (type === 'thinking') {
            this.sendToClient(client, { type: 'thinking', id: requestId, payload: { content: data } });
          } else if (type === 'tool_use') {
            toolsUsed.push({ name: (data as any)?.name ?? 'unknown', success: true });
            this.sendToClient(client, { type: 'tool_use', id: requestId, payload: data });
          } else if (type === 'tool_result') {
            // Update last tool's success based on result
            if (toolsUsed.length > 0 && (data as any)?.error) {
              toolsUsed[toolsUsed.length - 1].success = false;
            }
            this.sendToClient(client, { type: 'tool_result', id: requestId, payload: data });
          } else if (type === 'status') {
            this.sendToClient(client, { type: 'status', id: requestId, payload: data });
          }
        },
        { tools, fallbackCandidates },
      );

      // Feed tool usage to awareness collector
      if (this.architectAwarenessCollector && toolsUsed.length > 0) {
        this.architectAwarenessCollector.updateToolContext(toolsUsed);
      }
      // Store tools for next turn's enrichment context
      this.lastToolsUsed.set(session.id, toolsUsed);

      // ── Guardrail output scan ─────────────────────────────────────
      const outputScan = this.checkOutputGuardrails(fullResponse);
      const finalResponse = outputScan.response;
      if (outputScan.wasModified) {
        audit('guardrail.triggered', {
          action: outputScan.action,
          direction: 'output',
          channelType: 'webchat',
          sessionId: session.id,
        });
        // Send correction since chunks were already streamed
        this.sendToClient(client, {
          type: 'guardrail_correction',
          id: requestId,
          payload: { content: finalResponse },
        });
      }

      // Collect transparency metadata (best-effort)
      let transparencyMeta: TransparencyMeta | undefined;
      try {
        const modelId = routingResult?.selection.model ?? modelOverride ?? provider.defaultModel;
        const caps = provider.metadata.models[modelId];
        if (caps) {
          transparencyMeta = collectTransparencyMeta({
            enrichment: this.enrichmentPipeline
              ? { prompt: enrichedPrompt, metadata: { architect: architectResult.architectMeta, stages: (architectResult as any).stages ?? [] } }
              : { prompt: enrichedPrompt, metadata: { stages: [] } },
            completion: { content: finalResponse, usage, model: modelId, finishReason: 'stop', toolUse: toolsUsed.map(t => ({ name: t.name })) },
            capabilities: { costPer1kInput: caps.costPer1kInput, costPer1kOutput: caps.costPer1kOutput },
            providerName: provider.name,
            awarenessSignals: [],
            responseText: finalResponse,
            processingStartTime,
          });
        }
      } catch {
        // Transparency is best-effort — never block message delivery
      }

      // Save assistant message (skip if empty — happens when response is tool-only)
      if (finalResponse) {
        await this.sessions.addMessage(session.id, 'assistant', finalResponse, {
          input: usage.inputTokens,
          output: usage.outputTokens,
        }, {
          ...(architectResult.architectMeta ? { architectDomain: architectResult.architectMeta.detectedContext.domain } : {}),
          ...(transparencyMeta ? { transparency: transparencyMeta } : {}),
        });
      }

      // Record usage for cost tracking
      if (this.modelRouter && routingResult) {
        this.modelRouter.recordUsage(
          routingResult.selection.provider,
          routingResult.selection.model,
          usage.inputTokens,
          usage.outputTokens,
        );
      }

      // Extract memories and learn from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && finalResponse && processedContent.length > 20) {
        void this.extractAndLearn(processedContent, finalResponse, session.id);
      }

      // Auto-title webchat chats after first exchange
      if (
        finalResponse &&
        session.metadata.channelType === 'webchat' &&
        session.messages.length <= 3
      ) {
        void this.generateChatTitle(session.id, processedContent, finalResponse, client);
      }

      // Send done signal
      this.sendToClient(client, {
        type: 'done',
        id: requestId,
        payload: {
          usage,
          routing: routingResult ? {
            model: routingResult.selection.model,
            provider: routingResult.selection.provider,
            isLocal: routingResult.selection.isLocal,
            taskType: routingResult.classification.type,
          } : (providerOverride || modelOverride) ? {
            model: modelOverride,
            provider: providerOverride || this.config.provider.primary,
            override: true,
          } : undefined,
          architect: architectResult.architectMeta,
          transparency: transparencyMeta,
        },
      });

      // Background self-awareness analysis
      if (this.selfAwarenessAssembler) {
        this.selfAwarenessAssembler.afterResponse({
          userId: client.senderId ?? 'anonymous',
          sessionId: session.id,
          chatId: chatId ?? session.id,
          currentMessage: processedContent,
          recentMessages: contextMessages,
          response: finalResponse,
          responseTime: Date.now() - (session.metadata.lastActiveAt ?? Date.now()),
          tokensUsed: { input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 },
          streamChunks: streamChunkCount,
        } as any).catch(() => {});
      }

      // Record conversation in consciousness journal
      if (this.consciousness) {
        const journalBase = {
          sessionId: session.id,
          type: 'message' as const,
          context: {
            domains: architectResult.architectMeta
              ? [architectResult.architectMeta.detectedContext.domain]
              : ['general' as const],
          },
          selfState: {
            health: (this.healthMonitor?.getHealthState().overall === 'unhealthy' ? 'degraded' : this.healthMonitor?.getHealthState().overall ?? 'healthy') as 'healthy' | 'degraded' | 'critical',
            activeProviders: [this.config.provider.primary],
            uptime: Math.round(process.uptime()),
          },
        };
        this.consciousness.journal.record({ ...journalBase, message: { role: 'user', content: processedContent } }).catch(() => {});
        this.consciousness.journal.record({ ...journalBase, message: { role: 'assistant', content: finalResponse } }).catch(() => {});
      }

      audit('message.sent', {
        sessionId: session.id,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: routingResult?.selection.model,
        provider: routingResult?.selection.provider,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      audit('channel.error', { sessionId: session.id, error: errorMessage });

      this.sendToClient(client, {
        type: 'error',
        id: requestId,
        payload: { message: `Error: ${errorMessage}` },
      });
    }
  }

  private async generateChatTitle(
    chatId: string,
    userMessage: string,
    assistantResponse: string,
    client: ClientConnection,
  ): Promise<void> {
    try {
      // Check if the chat is still titled "New Chat"
      const chat = this.sessions.listChats().find(c => c.id === chatId);
      if (!chat || chat.title !== 'New Chat') return;

      const provider = this.providers?.getPrimaryProvider();
      if (!provider) return;

      const titlePrompt = 'Generate a very short title (3-6 words, no quotes, no punctuation at end) for this conversation. Reply with ONLY the title.';
      const result = await provider.complete([
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantResponse.slice(0, 500) },
        { role: 'user', content: titlePrompt },
      ], { maxTokens: 30 });

      const title = result.content.trim().replace(/^["']|["']$/g, '').slice(0, 60);
      if (title) {
        this.sessions.renameChat(chatId, title);
        this.sendToClient(client, {
          type: 'chat_titled',
          payload: { chatId, title },
        });
      }
    } catch {
      // Non-fatal — chat keeps "New Chat" title
    }
  }

  private async handleCommand(
    client: ClientConnection,
    command: string,
    requestId?: string
  ): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'status': {
        const activeSessions = this.sessions.getActiveSessions();
        const providers = this.providers?.listAvailable() || [];
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `**Status**\n- Sessions: ${activeSessions.length} active\n- Providers: ${providers.join(', ') || 'none configured'}\n- Uptime: ${Math.floor(process.uptime())}s`,
          },
        });
        break;
      }

      case 'new':
      case 'reset': {
        const session = await this.sessions.getOrCreate(client.id, {
          channelType: client.channelType,
          clientId: client.id,
        });
        await this.sessions.clear(session.id);
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: 'Session cleared. Starting fresh!',
          },
        });
        break;
      }

      case 'mode': {
        const session = await this.sessions.getOrCreate(client.id, {
          channelType: client.channelType,
          clientId: client.id,
        });

        if (this.config.modes?.enabled === false || !this.modeLoader) {
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: { role: 'assistant', content: 'Modes are disabled in configuration.' },
          });
          break;
        }

        const subCmd = args[0]?.toLowerCase();
        const modeState = this.getSessionModeState(session.id);

        if (!subCmd || subCmd === 'status') {
          const modes = this.modeLoader.getAll();
          const modeList = [...modes.values()].map(m => `- **${m.name}** (\`${m.id}\`) — ${m.description}`).join('\n');
          const currentLabel = modeState.activeMode === 'auto' ? 'auto (auto-detect)' : modeState.activeMode === 'off' ? 'off' : modeState.activeMode;
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: {
              role: 'assistant',
              content: `**Current mode:** ${currentLabel}${modeState.lastAutoMode ? ` (last detected: ${modeState.lastAutoMode})` : ''}\n\n**Available modes:**\n${modeList}\n\n**Commands:** \`/mode <name>\`, \`/mode auto\`, \`/mode off\``,
            },
          });
        } else if (subCmd === 'auto') {
          modeState.activeMode = 'auto';
          modeState.autoDetected = false;
          modeState.lastSwitchAt = Date.now();
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: { role: 'assistant', content: 'Mode set to **auto**. I will detect the best mode from your messages.' },
          });
        } else if (subCmd === 'off') {
          modeState.activeMode = 'off';
          modeState.autoDetected = false;
          modeState.lastSwitchAt = Date.now();
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: { role: 'assistant', content: 'Modes disabled for this session.' },
          });
        } else if (MODE_IDS.includes(subCmd as ModeId)) {
          modeState.activeMode = subCmd as ModeId;
          modeState.autoDetected = false;
          modeState.lastSwitchAt = Date.now();
          const mode = this.modeLoader.get(subCmd as ModeId);
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: { role: 'assistant', content: `Switched to **${mode?.name ?? subCmd}** mode.` },
          });
        } else {
          this.sendToClient(client, {
            type: 'message',
            id: requestId,
            payload: { role: 'assistant', content: `Unknown mode: ${subCmd}. Use \`/mode\` to see available modes.` },
          });
        }
        break;
      }

      case 'help': {
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `**Commands**\n- /status - Show system status\n- /new - Start a new session\n- /reset - Clear current session\n- /mode - Show/switch personality modes\n- /help - Show this help`,
          },
        });
        break;
      }

      default: {
        this.sendToClient(client, {
          type: 'message',
          id: requestId,
          payload: {
            role: 'assistant',
            content: `Unknown command: ${cmd}. Try /help`,
          },
        });
      }
    }
  }

  /**
   * Execute a streaming AI call with tool follow-up loop.
   * When the AI calls tools, executes them and feeds results back to the AI
   * for synthesis, looping up to maxToolRounds times.
   */
  private async executeWithTools(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    enrichedPrompt: string,
    provider: import('@auxiora/providers').Provider,
    onChunk: (type: string, data: any) => void,
    options?: {
      maxToolRounds?: number;
      tools?: Array<{ name: string; description: string; input_schema: any }>;
      fallbackCandidates?: Array<{ provider: import('@auxiora/providers').Provider; name: string; model: string }>;
    }
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const maxRounds = options?.maxToolRounds ?? 10;
    const maxContinuations = 3; // Safety cap for auto-continue on truncation
    const tools = options?.tools ?? toolRegistry.toProviderFormat();
    let currentMessages = [...messages];
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    let fullResponse = '';
    let lastRoundHadTools = false;
    const loopState = createLoopDetectionState();

    for (let round = 0; round < maxRounds; round++) {
      let roundResponse = '';
      let roundUsage = { inputTokens: 0, outputTokens: 0 };
      let roundFinishReason = '';
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      const streamOptions = {
        systemPrompt: enrichedPrompt,
        tools: tools.length > 0 ? tools : undefined,
        passThroughAllTools: true,
      };

      const candidates = options?.fallbackCandidates ?? [
        { provider, name: provider.name, model: provider.defaultModel },
      ];

      for await (const chunk of streamWithModelFallback(
        { candidates },
        (p) => p.stream(currentMessages as any, streamOptions),
      )) {
        if (chunk.type === 'text' && chunk.content) {
          roundResponse += chunk.content;
          onChunk('text', chunk.content);
        } else if (chunk.type === 'thinking' && chunk.content) {
          onChunk('thinking', chunk.content);
        } else if (chunk.type === 'tool_use' && chunk.toolUse) {
          toolUses.push(chunk.toolUse);
          onChunk('tool_use', { tool: chunk.toolUse.name, params: chunk.toolUse.input });
        } else if (chunk.type === 'done') {
          roundUsage = chunk.usage || roundUsage;
          roundFinishReason = chunk.finishReason || '';
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error);
        }
      }

      totalUsage.inputTokens += roundUsage.inputTokens;
      totalUsage.outputTokens += roundUsage.outputTokens;

      // No tool calls — check if response was truncated
      if (toolUses.length === 0) {
        fullResponse += roundResponse;

        // Auto-continue if response was cut off by token limit
        const wasTruncated = roundFinishReason === 'max_tokens' || roundFinishReason === 'length';
        if (wasTruncated && fullResponse.length > 0) {
          let continuations = 0;
          while (continuations < maxContinuations) {
            continuations++;
            this.logger.info('Response truncated, auto-continuing', { continuations, finishReason: roundFinishReason });

            currentMessages.push({ role: 'assistant', content: fullResponse });
            currentMessages.push({ role: 'user', content: 'Continue where you left off.' });

            let contResponse = '';
            let contUsage = { inputTokens: 0, outputTokens: 0 };
            let contFinishReason = '';

            for await (const chunk of provider.stream(currentMessages as any, {
              systemPrompt: enrichedPrompt,
            })) {
              if (chunk.type === 'text' && chunk.content) {
                contResponse += chunk.content;
                onChunk('text', chunk.content);
              } else if (chunk.type === 'done') {
                contUsage = chunk.usage || contUsage;
                contFinishReason = chunk.finishReason || '';
              } else if (chunk.type === 'error') {
                throw new Error(chunk.error);
              }
            }

            totalUsage.inputTokens += contUsage.inputTokens;
            totalUsage.outputTokens += contUsage.outputTokens;
            fullResponse += contResponse;

            // Stop if the model finished naturally
            if (contFinishReason !== 'max_tokens' && contFinishReason !== 'length') {
              break;
            }
          }
        }

        lastRoundHadTools = false;
        break;
      }

      lastRoundHadTools = true;

      // Record the assistant's response (including tool use intent) in the conversation
      const assistantContent = roundResponse || `I'll use ${toolUses.map(t => t.name).join(', ')} to help with this.`;
      currentMessages.push({ role: 'assistant', content: assistantContent });
      await this.sessions.addMessage(sessionId, 'assistant', assistantContent);

      // Execute tools and collect results
      const context: ExecutionContext = {
        sessionId,
        workingDirectory: getWorkspacePath(),
        timeout: 30000,
      };

      const toolResultParts: string[] = [];
      for (const toolUse of toolUses) {
        // Map Claude Code emulation tool names to our actual tools
        const mapped = mapCCToolCall(toolUse.name, toolUse.input);

        // Skip CC-only tools that have no Auxiora equivalent
        if (mapped.skip) {
          onChunk('tool_result', { tool: toolUse.name, success: false, error: mapped.skip });
          toolResultParts.push(`[${toolUse.name}]: Error: ${mapped.skip}`);
          recordToolCall(loopState, toolUse.id, mapped.name, mapped.input);
          recordToolOutcome(loopState, toolUse.id, mapped.skip);
          continue;
        }

        recordToolCall(loopState, toolUse.id, mapped.name, mapped.input);
        try {
          const result = await toolExecutor.execute(mapped.name, mapped.input, context);
          onChunk('tool_result', {
            tool: toolUse.name,
            success: result.success,
            output: result.output,
            error: result.error,
          });
          // Truncate large tool outputs to avoid blowing context window
          let output = result.success ? (result.output || 'Success') : `Error: ${result.error}`;
          if (output.length > 50000) {
            output = output.slice(0, 50000) + '\n... [truncated]';
          }
          toolResultParts.push(`[${toolUse.name}]: ${output}`);
          recordToolOutcome(loopState, toolUse.id, output);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          onChunk('tool_result', { tool: toolUse.name, success: false, error: errorMessage });
          toolResultParts.push(`[${toolUse.name}]: Error: ${errorMessage}`);
          recordToolOutcome(loopState, toolUse.id, errorMessage);
        }
      }

      // Append tool results directly to conversation (don't rebuild from getContextMessages
      // which can drop messages due to token windowing)
      const toolResultsMessage = `[Tool Results]\n${toolResultParts.join('\n')}`;
      currentMessages.push({ role: 'user', content: toolResultsMessage });
      await this.sessions.addMessage(sessionId, 'user', toolResultsMessage);

      // Check for tool loop patterns
      const detection = detectLoop(loopState);
      if (detection.severity === 'critical') {
        this.logger.warn('Tool loop detected — forcing synthesis', {
          detector: detection.detector,
          message: detection.message,
          details: detection.details,
        });
        onChunk('status', { message: 'Loop detected, synthesizing results...' });
        lastRoundHadTools = true;
        break;
      }
      if (detection.severity === 'warning') {
        this.logger.info('Tool loop warning', {
          detector: detection.detector,
          message: detection.message,
        });
        currentMessages.push({ role: 'user', content: `⚠️ Loop detection warning: ${detection.message}\nPlease try a different approach or different parameters.` });
      }

      // Notify the client that tool processing is done and AI is thinking about results
      onChunk('status', { message: 'Analyzing results...' });
    }

    // If the loop ended because we hit maxRounds while still using tools,
    // do one final call WITHOUT tools to force a synthesis of all gathered info
    if (lastRoundHadTools) {
      let synthesisResponse = '';
      let synthesisUsage = { inputTokens: 0, outputTokens: 0 };

      currentMessages.push({ role: 'user', content: 'Now synthesize all the information gathered above into your final response. Do not call any more tools.' });

      for await (const chunk of provider.stream(currentMessages as any, {
        systemPrompt: enrichedPrompt,
        // No tools — force text-only synthesis
      })) {
        if (chunk.type === 'text' && chunk.content) {
          synthesisResponse += chunk.content;
          onChunk('text', chunk.content);
        } else if (chunk.type === 'done') {
          synthesisUsage = chunk.usage || synthesisUsage;
        }
      }

      totalUsage.inputTokens += synthesisUsage.inputTokens;
      totalUsage.outputTokens += synthesisUsage.outputTokens;
      fullResponse = synthesisResponse; // Replace accumulated "thinking out loud" with actual synthesis
    }

    return { response: fullResponse, usage: totalUsage };
  }

  private async handleVoiceMessage(
    client: ClientConnection,
    type: string,
    payload: unknown,
    audioBuffer?: Buffer
  ): Promise<void> {
    if (!this.voiceManager) {
      this.sendToClient(client, {
        type: 'voice_error',
        payload: { message: 'Voice mode not available' },
      });
      return;
    }

    try {
      if (type === 'voice_start') {
        const opts = payload as { voice?: string; language?: string } | undefined;
        this.voiceManager.startSession(client.id, {
          voice: opts?.voice,
          language: opts?.language,
        });
        this.sendToClient(client, { type: 'voice_ready' });
        return;
      }

      if (type === 'voice_cancel') {
        this.voiceManager.endSession(client.id);
        return;
      }

      if (type === 'voice_end' && audioBuffer) {
        // Feed audio into voice manager buffer then transcribe
        this.voiceManager.addAudioFrame(client.id, audioBuffer);
        const transcription = await this.voiceManager.transcribe(client.id);

        this.sendToClient(client, {
          type: 'voice_transcript',
          payload: { text: transcription.text, final: true },
        });

        audit('voice.transcribed', {
          clientId: client.id,
          duration: transcription.duration,
          language: transcription.language,
          textLength: transcription.text.length,
        });

        // Feed transcribed text into AI pipeline
        if (!this.providers) {
          this.sendToClient(client, {
            type: 'voice_error',
            payload: { message: 'AI providers not configured' },
          });
          this.voiceManager.endSession(client.id);
          return;
        }

        const session = await this.sessions.getOrCreate(client.id, {
          channelType: client.channelType,
          clientId: client.id,
          senderId: client.senderId,
        });

        await this.sessions.addMessage(session.id, 'user', transcription.text);

        const contextMessages = this.sessions.getContextMessages(
          session.id,
          this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
          4096,
        );
        const chatMessages = sanitizeTranscript(contextMessages).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Enrich prompt with memories (same as text flow)
        let voicePrompt = this.systemPrompt;
        if (this.memoryRetriever && this.memoryStore) {
          const memories = await this.memoryStore.getAll();
          const memorySection = this.memoryRetriever.retrieve(memories, transcription.text);
          if (memorySection) {
            voicePrompt = this.systemPrompt + memorySection;
          }
        }

        // Use executeWithTools for voice — tools execute silently, only final text goes to TTS
        const provider = this.providers.getPrimaryProvider();
        const fallbackCandidates = this.providers.resolveFallbackCandidates();
        const { response: voiceResponse, usage: voiceUsage } = await this.executeWithTools(
          session.id,
          chatMessages,
          voicePrompt,
          provider,
          (_type, _data) => {
            // Voice: don't stream chunks to client — we synthesize the final text
          },
          { fallbackCandidates },
        );

        await this.sessions.addMessage(session.id, 'assistant', voiceResponse, {
          input: voiceUsage.inputTokens,
          output: voiceUsage.outputTokens,
        });

        // Extract memories from voice conversation
        if (this.config.memory?.autoExtract !== false && this.memoryStore && voiceResponse && transcription.text.length > 20) {
          void this.extractAndLearn(transcription.text, voiceResponse, session.id);
        }

        // Send text response
        this.sendToClient(client, {
          type: 'voice_text',
          payload: { content: voiceResponse },
        });

        // Stream TTS audio
        for await (const chunk of this.voiceManager.synthesize(client.id, voiceResponse)) {
          this.gateway.sendBinary(client, chunk);
        }

        audit('voice.synthesized', {
          clientId: client.id,
          textLength: voiceResponse.length,
          voice: this.config.voice?.defaultVoice ?? 'alloy',
        });

        this.sendToClient(client, { type: 'voice_end' });
        this.voiceManager.endSession(client.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.sendToClient(client, {
        type: 'voice_error',
        payload: { message: errorMessage },
      });
      this.voiceManager.endSession(client.id);
    }
  }

  private sendToClient(client: ClientConnection, message: object): void {
    if (client.ws.readyState === 1) {
      // WebSocket.OPEN
      client.ws.send(JSON.stringify(message));
    }
  }

  /** Load persisted channel targets from disk so behavior delivery survives restarts. */
  private async loadChannelTargets(): Promise<void> {
    try {
      const data = await fs.readFile(this.channelTargetsPath, 'utf-8');
      const targets = JSON.parse(data) as Record<string, string>;
      for (const [channelType, channelId] of Object.entries(targets)) {
        // Only load if we don't already have a fresher entry from this session
        if (!this.lastActiveChannels.has(channelType)) {
          this.lastActiveChannels.set(channelType, channelId);
        }
      }
      this.logger.debug('Loaded channel targets', { channels: Object.keys(targets) });
    } catch {
      // File doesn't exist yet — that's fine
    }
  }

  /** Persist channel targets to disk. */
  private async saveChannelTargets(): Promise<void> {
    try {
      const targets: Record<string, string> = {};
      for (const [channelType, channelId] of this.lastActiveChannels) {
        targets[channelType] = channelId;
      }
      await fs.mkdir(path.dirname(this.channelTargetsPath), { recursive: true });
      await fs.writeFile(this.channelTargetsPath, JSON.stringify(targets, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn('Failed to save channel targets', {
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  /** Track an agent starting execution. Broadcasts to dashboard. */
  private agentStart(id: string, type: string, description: string, channelType?: string): void {
    const activity = { id, type, description, channelType, startedAt: new Date().toISOString() };
    this.activeAgents.set(id, activity);
    this.gateway.broadcast(
      { type: 'agent_start', payload: activity },
      (client) => client.authenticated
    );
  }

  /** Track an agent finishing execution. Broadcasts to dashboard. */
  private agentEnd(id: string, success: boolean): void {
    const activity = this.activeAgents.get(id);
    if (!activity) return;
    const duration = Date.now() - new Date(activity.startedAt).getTime();
    this.activeAgents.delete(id);
    this.gateway.broadcast(
      { type: 'agent_end', payload: { id, duration, success } },
      (client) => client.authenticated
    );
  }

  /** Get all currently active agents. */
  getActiveAgents(): Array<{ id: string; type: string; description: string; channelType?: string; startedAt: string }> {
    return Array.from(this.activeAgents.values());
  }

  /** Persist a message to the webchat session so it appears in chat history. */
  private persistToWebchat(content: string): void {
    this.sessions.getOrCreate('webchat', { channelType: 'webchat' })
      .then(session => this.sessions.addMessage(session.id, 'assistant', content))
      .catch((err) => {
        this.logger.warn('Failed to persist webchat message', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
  }

  /** Deliver a proactive message to all connected channel adapters using tracked channel IDs.
   *  Also persists to the webchat session so messages appear in chat history.
   *  @param exclude - channel type to skip (already delivered by targeted send) */
  private deliverToAllChannels(content: string, exclude?: string): void {
    this.persistToWebchat(content);

    // Deliver to external channel adapters (Discord, Slack, Telegram, etc.)
    if (!this.channels) return;
    for (const ct of this.channels.getConnectedChannels()) {
      if (ct === exclude) continue;
      const targetId = this.lastActiveChannels.get(ct)
        ?? this.channels.getDefaultChannelId(ct);
      if (!targetId) continue;
      this.channels.send(ct as any, targetId, { content }).catch((err) => {
        this.logger.warn('Proactive channel delivery failed', {
          channelType: ct,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    }
  }

  private async handleChannelMessage(inbound: InboundMessage): Promise<void> {
    const requestId = generateRequestId();
    return runWithRequestId(requestId, async () => {
    // Track last-active channel ID for proactive delivery and persist to disk
    this.lastActiveChannels.set(inbound.channelType, inbound.channelId);
    void this.saveChannelTargets();

    // Get or create session for this sender
    const session = await this.sessions.getOrCreate(
      `${inbound.channelType}:${inbound.senderId}`,
      {
        channelType: inbound.channelType,
        senderId: inbound.senderId,
      }
    );

    // Handle commands
    if (inbound.content.startsWith('/')) {
      const response = await this.handleChannelCommand(inbound.content, session.id);
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: response,
          replyToId: inbound.id,
        });
      }
      return;
    }

    // Process media attachments and add user message
    let messageContent = inbound.content;
    if (inbound.attachments && inbound.attachments.length > 0 && this.mediaProcessor) {
      messageContent = await this.mediaProcessor.process(inbound.attachments, inbound.content);
    }
    // ── Guardrail input scan ──────────────────────────────────────
    const inputScan = this.checkInputGuardrails(messageContent);
    if (inputScan && inputScan.action === 'block') {
      audit('guardrail.triggered', {
        action: 'block',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: inbound.channelType,
        sessionId: session.id,
      });
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: this.GUARDRAIL_BLOCK_MESSAGE,
          replyToId: inbound.id,
        });
      }
      return;
    }

    // Apply redaction if guardrails flagged PII
    if (inputScan?.action === 'redact' && inputScan.redactedContent) {
      messageContent = inputScan.redactedContent;
      audit('guardrail.triggered', {
        action: 'redact',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: inbound.channelType,
      });
    } else if (inputScan?.action === 'warn') {
      audit('guardrail.triggered', {
        action: 'warn',
        direction: 'input',
        threatCount: inputScan.threats.length,
        channelType: inbound.channelType,
      });
    }

    await this.sessions.addMessage(session.id, 'user', messageContent);

    // Check if providers are available
    if (!this.providers) {
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: 'I need API keys to respond. Please configure them in the vault.',
          replyToId: inbound.id,
        });
      }
      return;
    }

    // Get context messages — channel sessions use a capped token budget and turn limit
    // to prevent excessively long API calls from models with huge context windows.
    const contextMessages = this.sessions.getContextMessages(
      session.id,
      this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
      4096,
      { isChannel: true },
    );
    const chatMessages = sanitizeTranscript(contextMessages).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Show typing indicator while generating response
    const stopTyping = this.channels
      ? await this.channels.startTyping(inbound.channelType, inbound.channelId)
      : () => {};

    const channelAgentId = `channel:${inbound.channelType}:${inbound.channelId}:${Date.now()}`;

    // 4-minute timeout for the entire LLM response cycle.
    // Increased from 2min to accommodate auto-continuations (max_tokens → "Continue")
    // and tool round-trips. If the provider stream hangs (network issue, overloaded API),
    // this ensures the user gets an error message instead of infinite "typing…".
    const CHANNEL_RESPONSE_TIMEOUT_MS = 240_000;

    let draftLoop: DraftStreamLoop | null = null;
    let draftMessageId: string | null = null;

    try { // outer try — finally block guarantees stopTyping() runs
    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Build enriched prompt through pipeline
      let enrichedPrompt = this.systemPrompt;
      const channelChatId = `${inbound.channelType}:${inbound.channelId}`;
      let channelArchitectResult: { prompt: string; architectMeta?: any } = { prompt: this.systemPrompt };

      // Reset Architect conversation state for new channel chats
      const useChannelArchitect = this.config.agent.personality === 'the-architect';
      if (useChannelArchitect && this.architect && !this.architectResetChats.has(channelChatId)) {
        this.architectResetChats.add(channelChatId);
        this.architect.resetConversation();
        audit('personality.reset', { sessionId: session.id, chatId: channelChatId });
      }

      if (this.enrichmentPipeline) {
        const enrichCtx: EnrichmentContext = {
          basePrompt: this.systemPrompt,
          userMessage: messageContent,
          history: contextMessages,
          channelType: inbound.channelType,
          chatId: channelChatId,
          sessionId: session.id,
          userId: inbound.senderId ?? 'anonymous',
          toolsUsed: this.lastToolsUsed.get(session.id) ?? [],
          config: this.config,
          senderName: inbound.senderName,
          groupContext: inbound.groupContext,
        };
        const result = await this.enrichmentPipeline.run(enrichCtx);
        enrichedPrompt = result.prompt;
        channelArchitectResult = { prompt: enrichedPrompt, architectMeta: result.metadata.architect };
      }

      // Use executeWithTools for channels — collect final text for channel reply
      const provider = this.providers.getPrimaryProvider();

      // Inject model identity so the AI knows what it's running on
      enrichedPrompt += this.buildModelIdentityFragment(provider);

      this.agentStart(channelAgentId, 'channel', `Processing message on ${inbound.channelType}`, inbound.channelType);

      // Draft streaming: edit message in place if adapter supports it
      const adapter = this.channels?.getAdapter(inbound.channelType);
      const supportsDraft = !!adapter?.editMessage;

      let accumulatedText = '';

      if (supportsDraft && this.channels) {
        const channels = this.channels;
        draftLoop = new DraftStreamLoop(async (text) => {
          try {
            if (!draftMessageId) {
              const result = await channels.send(inbound.channelType, inbound.channelId, {
                content: text,
                replyToId: inbound.id,
              });
              if (result.success && result.messageId) {
                draftMessageId = result.messageId;
              }
              return result.success;
            } else {
              const result = await channels.editMessage(
                inbound.channelType,
                inbound.channelId,
                draftMessageId,
                { content: text },
              );
              return result.success;
            }
          } catch {
            return false;
          }
        }, 1000);
      }

      const fallbackCandidates = this.providers.resolveFallbackCandidates();
      const channelToolsUsed: Array<{ name: string; success: boolean }> = [];
      const { response: channelResponse, usage: channelUsage } = await Promise.race([
        this.executeWithTools(
          session.id,
          chatMessages,
          enrichedPrompt,
          provider,
          (type, data) => {
            if (type === 'text' && data && draftLoop) {
              accumulatedText += data;
              draftLoop.update(accumulatedText);
            } else if (type === 'tool_use') {
              channelToolsUsed.push({ name: (data as any)?.name ?? 'unknown', success: true });
            } else if (type === 'tool_result') {
              if (channelToolsUsed.length > 0 && (data as any)?.error) {
                channelToolsUsed[channelToolsUsed.length - 1].success = false;
              }
            }
          },
          { tools, fallbackCandidates },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Response timed out — the AI provider did not respond within 4 minutes. Please try again.')), CHANNEL_RESPONSE_TIMEOUT_MS),
        ),
      ]);

      // Feed tool usage to awareness collector
      if (this.architectAwarenessCollector && channelToolsUsed.length > 0) {
        this.architectAwarenessCollector.updateToolContext(channelToolsUsed);
      }
      this.lastToolsUsed.set(session.id, channelToolsUsed);

      // Flush final draft text
      if (draftLoop) {
        if (channelResponse && channelResponse !== accumulatedText) {
          draftLoop.update(channelResponse);
        }
        await draftLoop.flush();
        draftLoop.stop();
      }

      // ── Guardrail output scan ─────────────────────────────────────
      const channelOutputScan = this.checkOutputGuardrails(channelResponse);
      const finalChannelResponse = channelOutputScan.response;
      if (channelOutputScan.wasModified) {
        audit('guardrail.triggered', {
          action: channelOutputScan.action,
          direction: 'output',
          channelType: inbound.channelType,
          sessionId: session.id,
        });
        // If draft streaming already sent partial text, do a final edit with clean version
        if (draftMessageId && adapter?.editMessage) {
          await adapter.editMessage(inbound.channelId, draftMessageId, { content: finalChannelResponse });
        }
      }

      // Save assistant message
      await this.sessions.addMessage(session.id, 'assistant', finalChannelResponse, {
        input: channelUsage.inputTokens,
        output: channelUsage.outputTokens,
      }, channelArchitectResult.architectMeta ? { architectDomain: channelArchitectResult.architectMeta.detectedContext.domain } : undefined);

      // Extract memories and learn from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && finalChannelResponse && messageContent.length > 20) {
        void this.extractAndLearn(messageContent, finalChannelResponse, session.id);
      }

      // Send final response. The draft stream loop edits a single message,
      // but Discord silently truncates edits at 2000 chars. For long responses,
      // replace the draft with a chunked send so nothing is lost.
      const DRAFT_SAFE_LENGTH = 1900; // leave margin below Discord's 2000 char limit
      if (draftMessageId && this.channels && finalChannelResponse.length > DRAFT_SAFE_LENGTH) {
        // Draft only showed partial content — replace it with a pointer and send full chunked response
        if (adapter?.editMessage) {
          await adapter.editMessage(inbound.channelId, draftMessageId, {
            content: '*\u2026 (full response below)*',
          });
        }
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: finalChannelResponse,
        });
      } else if (!draftMessageId && this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: finalChannelResponse,
          replyToId: inbound.id,
        });
      }

      audit('message.sent', {
        channelType: inbound.channelType,
        sessionId: session.id,
        inputTokens: channelUsage.inputTokens,
        outputTokens: channelUsage.outputTokens,
      });

      this.agentEnd(channelAgentId, true);
    } catch (error) {
      if (draftLoop) draftLoop.stop();
      this.agentEnd(channelAgentId, false);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      audit('channel.error', { sessionId: session.id, error: errorMessage });

      if (this.channels) {
        const errorContent = `Error: ${errorMessage}`;
        // If a draft message exists, edit it with the error instead of sending a new one
        if (draftMessageId) {
          try {
            await this.channels.editMessage(
              inbound.channelType,
              inbound.channelId,
              draftMessageId,
              { content: errorContent },
            );
          } catch {
            // Edit failed — fall back to new message
            await this.channels.send(inbound.channelType, inbound.channelId, {
              content: errorContent,
              replyToId: inbound.id,
            });
          }
        } else {
          await this.channels.send(inbound.channelType, inbound.channelId, {
            content: errorContent,
            replyToId: inbound.id,
          });
        }
      }
    }
    } finally {
      stopTyping();
    }
    }); // end runWithRequestId
  }

  private async handleChannelCommand(command: string, sessionId: string): Promise<string> {
    const [cmd] = command.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'status': {
        const activeSessions = this.sessions.getActiveSessions();
        const providers = this.providers?.listAvailable() || [];
        const channels = this.channels?.getConnectedChannels() || [];
        return `**Status**\n- Sessions: ${activeSessions.length} active\n- Providers: ${providers.join(', ') || 'none'}\n- Channels: ${channels.join(', ') || 'webchat only'}`;
      }

      case 'new':
      case 'reset': {
        await this.sessions.clear(sessionId);
        return 'Session cleared. Starting fresh!';
      }

      case 'help': {
        return `**Commands**\n- /status - Show system status\n- /new - Start a new session\n- /reset - Clear current session\n- /help - Show this help`;
      }

      default:
        return `Unknown command: ${cmd}. Try /help`;
    }
  }

  /** Register each connector action as an AI-callable tool. */
  private registerConnectorTools(): void {
    if (!this.connectorRegistry || !this.connectorAuthManager) return;

    for (const connector of this.connectorRegistry.list()) {
      // Only register tools for connectors with active auth tokens
      if (!this.connectorAuthManager.hasToken(connector.id)) continue;

      for (const action of connector.actions) {
        const toolName = `${connector.id.replace(/-/g, '_')}_${action.id.replace(/-/g, '_')}`;

        // Convert connector param schema to tool parameters
        const parameters: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; description: string; required: boolean }> = [];
        for (const [paramName, paramDef] of Object.entries(action.params)) {
          parameters.push({
            name: paramName,
            type: paramDef.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
            description: paramDef.description,
            required: paramDef.required ?? false,
          });
        }

        const connectorId = connector.id;
        const actionId = action.id;
        const authManager = this.connectorAuthManager;

        toolRegistry.register({
          name: toolName,
          description: `[${connector.name}] ${action.description}`,
          parameters,
          getPermission: () => {
            // Trust level 0-1 = require approval, 2+ = auto-approve
            return action.trustMinimum >= 2
              ? ToolPermission.AUTO_APPROVE
              : ToolPermission.USER_APPROVAL;
          },
          execute: async (params) => {
            const token = authManager.getToken(connectorId);
            if (!token) {
              return { success: false, error: `${connector.name} is not connected. Please authenticate first.` };
            }
            try {
              const result = await connector.executeAction(actionId, params, token.accessToken);
              return { success: true, output: JSON.stringify(result, null, 2) };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
          },
        });
      }

      this.logger.info(`Registered ${connector.actions.length} tools for connector: ${connector.name}`);
    }
  }

  private getProviderMaxTokens(provider: import('@auxiora/providers').Provider): number | undefined {
    const model = provider.defaultModel;
    return provider.metadata?.models?.[model]?.maxContextTokens;
  }

  private async extractAndLearn(userMessage: string, assistantResponse: string, sessionId: string): Promise<void> {
    try {
      const recentMessages = this.sessions.getContextMessages(
        sessionId,
        this.getProviderMaxTokens(this.providers.getPrimaryProvider()),
      );

      // AI-powered extraction
      if (this.memoryExtractor) {
        const result = await this.memoryExtractor.extract(userMessage, assistantResponse, {
          messageCount: recentMessages.length,
          sessionAge: 0, // approximation; session age not easily available here
        });

        // Record personality adaptation signals
        if (this.personalityAdapter && result.personalitySignals.length > 0) {
          for (const signal of result.personalitySignals) {
            await this.personalityAdapter.recordSignal(signal);
          }
        }

        const totalExtracted =
          result.factsExtracted.length +
          result.patternsDetected.length +
          result.relationshipsFound.length;
        if (totalExtracted > 0) {
          void audit('memory.extracted', { count: totalExtracted });
        }
      }

      // Run local pattern detection on recent messages
      if (this.patternDetector && this.memoryStore) {
        const recent = recentMessages.slice(-20);
        const patterns = this.patternDetector.detect(
          recent.map(m => ({
            content: m.content,
            role: m.role,
            timestamp: m.timestamp,
          })),
        );
        for (const pattern of patterns) {
          await this.memoryStore.add(pattern.pattern, 'pattern', 'observed', {
            confidence: pattern.confidence,
          });
        }
      }
    } catch (error) {
      // Silent failure — don't block the response
      this.logger.warn('Memory extraction failed', { error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  async getLivingMemoryState(): Promise<LivingMemoryState | null> {
    if (!this.memoryStore) return null;
    const all = await this.memoryStore.getAll();
    const stats = await this.memoryStore.getStats();
    return {
      facts: all.filter(m => ['preference', 'fact', 'context'].includes(m.category)),
      relationships: all.filter(m => m.category === 'relationship'),
      patterns: all.filter(m => m.category === 'pattern'),
      adaptations: this.personalityAdapter ? await this.personalityAdapter.getAdjustments() : [],
      stats,
    };
  }

  private createWebhookRouter(): Router {
    const router = Router();

    // Generic webhooks
    router.post('/custom/:name', async (req: Request, res: Response) => {
      if (!this.webhookManager) {
        res.status(503).json({ error: 'Webhooks not available' });
        return;
      }

      // Collect raw body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const body = Buffer.concat(chunks);

      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      const result = await this.webhookManager.handleGenericWebhook(
        name,
        body,
        req.headers as Record<string, string>,
      );

      res.status(result.status).json({
        accepted: result.accepted,
        ...(result.error && !result.accepted ? { error: result.error } : {}),
      });
    });

    // Channel webhooks — Twilio
    router.post('/twilio', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('twilio');
      if (!adapter) {
        res.status(503).json({ error: 'Twilio not configured' });
        return;
      }

      const twilioAdapter = adapter as any;
      await twilioAdapter.handleWebhook(req.body);
      res.status(200).type('text/xml').send('<Response></Response>');
    });

    // Channel webhooks — Telegram
    router.post('/telegram', async (req: Request, res: Response) => {
      if (!this.channels) {
        res.status(503).json({ error: 'Channels not available' });
        return;
      }

      const adapter = this.channels.getAdapter('telegram');
      if (!adapter) {
        res.status(503).json({ error: 'Telegram not configured' });
        return;
      }

      const telegramAdapter = adapter as any;
      await telegramAdapter.handleWebhook(req.body);
      res.sendStatus(200);
    });

    return router;
  }

  async start(): Promise<void> {
    if (this.running) return;

    await this.gateway.start();

    // Connect channels if configured
    if (this.channels) {
      try {
        await this.channels.connectAll();
        const connected = this.channels.getConnectedChannels();
        if (connected.length > 0) {
          this.logger.info(`Connected channels: ${connected.join(', ')}`);
        }
      } catch (error) {
        this.logger.warn('Some channels failed to connect', { error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    // Load persisted channel targets for proactive delivery (behaviors, ambient)
    await this.loadChannelTargets();

    // Research job expiry (every 60s, prune jobs older than 1 hour)
    this.researchJobExpiry = setInterval(() => {
      const ONE_HOUR = 3_600_000;
      const now = Date.now();
      for (const [id, job] of this.researchJobs) {
        if (now - job.createdAt > ONE_HOUR) this.researchJobs.delete(id);
      }
    }, 60_000);

    this.running = true;

    console.log(`\n${this.getAgentName()} is ready!`);
    console.log(`Open http://${this.config.gateway.host}:${this.config.gateway.port} in your browser\n`);
  }

  private async processEventTriggers(events: TriggerEvent[]): Promise<void> {
    if (!this.behaviors || events.length === 0) return;

    const allBehaviors = await this.behaviors.list();
    const eventBehaviors = allBehaviors.filter(
      (b: any) => b.type === 'event' && b.status === 'active' && b.eventTrigger
    );

    for (const event of events) {
      // Feed to ambient pattern engine
      this.ambientEngine?.observe({
        type: `${event.connectorId}:${event.triggerId}`,
        timestamp: event.timestamp,
        data: event.data,
      });

      // Match against event behaviors
      for (const behavior of eventBehaviors) {
        const trigger = behavior.eventTrigger!;
        if (trigger.source !== event.connectorId || trigger.event !== event.triggerId) continue;

        if (evaluateConditions(event.data, trigger.conditions, trigger.combinator)) {
          try {
            await this.behaviors!.executeNow(behavior.id);
            await audit('behavior.event_triggered', {
              behaviorId: behavior.id,
              source: event.connectorId,
              event: event.triggerId,
            });
          } catch {
            // Execution failures tracked by BehaviorManager
          }
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.channels) {
      await this.channels.disconnectAll();
    }
    await this.gateway.stop();
    if (this.behaviors) {
      await this.behaviors.stop();
    }
    if (this.browserManager) {
      await this.browserManager.shutdown();
    }
    if (this.voiceManager) {
      await this.voiceManager.shutdown();
    }
    if (this.pluginLoader) {
      await this.pluginLoader.shutdownAll();
    }
    if (this.ambientScheduler) {
      this.ambientScheduler.stop();
    }
    if (this.ambientDetectTimer) {
      clearInterval(this.ambientDetectTimer);
    }
    if (this.autonomousExecutor) {
      this.autonomousExecutor.stop();
    }
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = undefined;
    }
    if (this.researchJobExpiry) {
      clearInterval(this.researchJobExpiry);
      this.researchJobExpiry = undefined;
    }
    if (this.mcpClientManager) {
      await this.mcpClientManager.disconnectAll();
    }
    if (this.modelRefreshTimer) {
      clearInterval(this.modelRefreshTimer);
      this.modelRefreshTimer = undefined;
    }
    if (this.jobQueue) {
      await this.jobQueue.stop(30000);
    }
    // Session reflection — capture insights before shutdown
    if (this.sessionReflector) {
      try {
        const reflection = this.sessionReflector.reflect('shutdown');
        this.sessionReflector.save(reflection);
      } catch { /* best-effort — don't block shutdown */ }
    }
    this.consciousness?.shutdown();
    this.sessions.destroy();
    this.vault.lock();
    this.running = false;
  }

  getConfig(): Config {
    return this.config;
  }

  getAgentName(): string {
    return this.config.agent?.name ?? 'Auxiora';
  }

  private createPersonalityRouter(): import('express').Router {
    const router = Router();
    const guard = (_req: any, res: any): boolean => {
      if (!this.architect) {
        res.status(503).json({ error: 'Architect not available' });
        return false;
      }
      return true;
    };

    // --- Decisions (Gap 4) ---

    router.post('/decisions', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { domain, summary, context, followUpDate } = req.body ?? {};
      if (!domain || !summary || !context) {
        res.status(400).json({ error: 'Missing required fields: domain, summary, context' });
        return;
      }
      try {
        const decision = await this.architect!.recordDecision({ domain, summary, context, followUpDate, status: 'active' });
        audit('personality.decision.created', { decisionId: decision.id, domain });
        res.status(201).json(decision);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to record decision' });
      }
    });

    router.patch('/decisions/:id', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { status, outcome, followUpDate } = req.body ?? {};
      try {
        await this.architect!.updateDecision(req.params.id, { status, outcome, followUpDate });
        audit('personality.decision.updated', { decisionId: req.params.id });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to update decision' });
      }
    });

    router.get('/decisions', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const { domain, status, since, search, limit } = req.query;
        const query: Record<string, unknown> = {};
        if (domain) query.domain = domain;
        if (status) query.status = status;
        if (since) query.since = since;
        if (search) query.search = search;
        if (limit) query.limit = Number(limit);
        const decisions = await this.architect!.queryDecisions(query);
        res.json({ decisions });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to query decisions' });
      }
    });

    router.get('/decisions/due', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const due = await this.architect!.getDueFollowUps();
        res.json({ decisions: due });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to get due follow-ups' });
      }
    });

    // --- Traits (Gap 5) ---

    router.get('/traits', (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const mix = this.architect!.getTraitMix({
          domain: 'general' as any,
          emotionalRegister: 'neutral' as any,
          stakes: 'moderate',
          complexity: 'moderate',
          mode: 'solo_work',
        });
        const overrides = this.architect!.getActiveOverrides();
        res.json({ mix, overrides });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to get traits' });
      }
    });

    router.put('/traits/:trait', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { offset, source, reason } = req.body ?? {};
      if (typeof offset !== 'number') {
        res.status(400).json({ error: 'Missing or invalid field: offset must be a number' });
        return;
      }
      try {
        await this.architect!.setTraitOverride(req.params.trait as any, offset);
        audit('personality.trait.override', { trait: req.params.trait, offset, source, reason });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to set trait override' });
      }
    });

    router.delete('/traits/:trait', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        await this.architect!.removeTraitOverride(req.params.trait as any);
        audit('personality.trait.override', { trait: req.params.trait, action: 'removed' });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to remove trait override' });
      }
    });

    // --- Presets (Gap 5) ---

    router.get('/presets', (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const presets = this.architect!.listPresets();
        res.json({ presets });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to list presets' });
      }
    });

    router.post('/presets/:name/apply', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        await this.architect!.loadPreset(req.params.name);
        audit('personality.preset.applied', { preset: req.params.name });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to apply preset' });
      }
    });

    // --- Preferences (Gap 12) ---

    router.get('/preferences', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const prefs = await this.architect!.getPreferences();
        res.json(prefs);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to get preferences' });
      }
    });

    router.put('/preferences', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const body = req.body ?? {};
      try {
        for (const [key, value] of Object.entries(body)) {
          await this.architect!.updatePreference(key as any, value as any);
        }
        audit('personality.preferences.updated', { keys: Object.keys(body) });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to update preferences' });
      }
    });

    // --- Feedback insights ---

    router.get('/feedback/insights', (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const insights = this.architect!.getFeedbackInsights();
        res.json(insights);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to get feedback insights' });
      }
    });

    // --- User model ---

    router.get('/user-model', (_req: any, res: any) => {
      if (!guard(_req, res)) return;
      const model = this.getCachedUserModel();
      if (!model) {
        res.status(404).json({ error: 'User model not available' });
        return;
      }
      res.json(model);
    });

    // --- Memory management ---

    router.get('/memories', async (_req: any, res: any) => {
      if (!guard(_req, res)) return;
      if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
      const category = _req.query?.category as string | undefined;
      const data = category
        ? await this.memoryStore.getByCategory(category as any)
        : await this.memoryStore.getAll();
      res.json({ data });
    });

    router.get('/memories/search', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
      const q = req.query?.q as string;
      if (!q) { res.status(400).json({ error: 'Missing query parameter q' }); return; }
      const data = await this.memoryStore.search(q);
      res.json({ data });
    });

    router.get('/memories/export', async (_req: any, res: any) => {
      if (!guard(_req, res)) return;
      if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
      const data = await this.memoryStore.exportAll();
      res.json(data);
    });

    router.patch('/memories/:id', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
      const { content, importance } = req.body ?? {};
      const updated = await this.memoryStore.update(req.params.id, { content, importance });
      if (!updated) { res.status(404).json({ error: 'Memory not found' }); return; }
      res.json({ data: updated });
    });

    router.delete('/memories/:id', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      if (!this.memoryStore) { res.status(404).json({ error: 'Memory store not available' }); return; }
      const removed = await this.memoryStore.remove(req.params.id);
      if (!removed) { res.status(404).json({ error: 'Memory not found' }); return; }
      res.json({ success: true });
    });

    // --- Selective forgetting ---

    router.post('/forget', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { topic } = req.body ?? {};
      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Missing required field: topic' });
        return;
      }
      const removed = { memories: 0, decisions: 0 };
      if (this.memoryStore) {
        const matches = await this.memoryStore.search(topic);
        for (const m of matches) {
          if (await this.memoryStore.remove(m.id)) removed.memories++;
        }
      }
      if (this.architect) {
        try {
          const dl = (this.architect as any).decisionLog;
          if (dl) {
            const decisions = dl.query({ search: topic });
            for (const d of decisions) {
              dl.updateDecision(d.id, { status: 'abandoned' });
              removed.decisions++;
            }
          }
        } catch {}
      }
      res.json({ removed });
    });

    // --- Full personalization export ---

    router.get('/export/personalization', async (_req: any, res: any) => {
      if (!guard(_req, res)) return;
      const exportData: Record<string, unknown> = {
        version: 1,
        exportedAt: Date.now(),
      };
      if (this.memoryStore) {
        exportData.memories = await this.memoryStore.exportAll();
      }
      if (this.architect) {
        try {
          exportData.architect = JSON.parse(await this.architect.exportData());
        } catch {}
        exportData.userModel = this.getCachedUserModel();
      }
      res.json(exportData);
    });

    // --- Corrections (Gap 8) ---

    router.post('/corrections', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { userMessage, detectedDomain, correctedDomain } = req.body ?? {};
      if (!userMessage || !detectedDomain || !correctedDomain) {
        res.status(400).json({ error: 'Missing required fields: userMessage, detectedDomain, correctedDomain' });
        return;
      }
      try {
        await this.architect!.recordCorrection(
          userMessage,
          detectedDomain as import('@auxiora/personality/architect').ContextDomain,
          correctedDomain as import('@auxiora/personality/architect').ContextDomain,
        );
        audit('personality.correction', { detectedDomain, correctedDomain });
        res.status(201).json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to record correction' });
      }
    });

    router.get('/corrections/stats', (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const stats = this.architect!.getCorrectionStats();
        res.json(stats);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to get correction stats' });
      }
    });

    // --- Data portability (Gap 10) ---

    router.get('/export', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        const data = await this.architect!.exportData();
        audit('personality.data.exported', {});
        res.set('Content-Type', 'application/json');
        res.send(data);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to export data' });
      }
    });

    router.delete('/data', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      try {
        await this.architect!.clearAllData();
        audit('personality.data.cleared', {});
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to clear data' });
      }
    });

    // --- Conversation export (Gap 9 / Task 7) ---

    router.get('/sessions/:sessionId/export', (req: any, res: any) => {
      if (!guard(req, res)) return;
      const format = (req.query.format as string) || 'json';
      if (!['json', 'markdown', 'csv'].includes(format)) {
        res.status(400).json({ error: 'Invalid format. Must be json, markdown, or csv' });
        return;
      }
      try {
        const msgs = this.sessions.getMessages(req.params.sessionId);
        const chatMessages = msgs
          .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
          .map((m: Message) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
            metadata: m.metadata as any,
          }));
        const exported = this.architect!.exportConversationAs(
          chatMessages,
          req.params.sessionId,
          format as 'json' | 'markdown' | 'csv',
        );
        if (format === 'json') {
          res.set('Content-Type', 'application/json');
        } else if (format === 'markdown') {
          res.set('Content-Type', 'text/markdown');
        } else {
          res.set('Content-Type', 'text/csv');
        }
        res.send(exported);
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to export conversation' });
      }
    });

    // --- Feedback REST (Task 9) ---

    router.post('/sessions/:sessionId/messages/:messageId/feedback', async (req: any, res: any) => {
      if (!guard(req, res)) return;
      const { rating, note } = req.body ?? {};
      if (!rating || !['up', 'down'].includes(rating)) {
        res.status(400).json({ error: 'Missing or invalid rating. Must be "up" or "down"' });
        return;
      }
      try {
        let domain = 'general';
        const msgs = this.sessions.getMessages(req.params.sessionId);
        const msg = msgs.find((m: Message) => m.id === req.params.messageId);
        if (msg?.metadata?.architectDomain) {
          domain = msg.metadata.architectDomain as string;
        }
        const mapped = rating === 'up' ? 'helpful' : 'off_target';
        await this.architect!.recordFeedback({
          domain: domain as import('@auxiora/personality/architect').ContextDomain,
          rating: mapped,
          note,
        });
        audit('personality.feedback', {
          sessionId: req.params.sessionId,
          messageId: req.params.messageId,
          rating,
        });
        res.status(201).json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Failed to record feedback' });
      }
    });

    return router;
  }

  private async runResearchJob(job: ResearchJob, client: ClientConnection): Promise<void> {
    const onProgress = (event: ResearchProgressEvent) => {
      job.progress.push(event);
      this.sendToClient(client, { type: 'research_progress', payload: { jobId: job.id, ...event } });
    };
    const provider = this.providers.getPrimaryProvider();
    // NOTE: DeepResearchOrchestrator does not currently accept a DocumentStore parameter.
    // When it gains that support, pass this.documentStore here.
    const orchestrator = new DeepResearchOrchestrator(provider as any, undefined, this.researchEngine);
    const result = await orchestrator.research(job.question, job.depth, onProgress);

    if (job.depth === 'deep') {
      const reportGen = new ReportGenerator(provider as any);
      job.report = await reportGen.generateReport({
        ...result,
        question: job.question,
        depth: job.depth,
      });
    }
    job.status = 'completed';
    job.completedAt = Date.now();
    await audit('research.completed', {
      jobId: job.id,
      sourceCount: result.sources.length,
      duration: job.completedAt - job.createdAt,
    });
    this.sendToClient(client, { type: 'research_completed', payload: { jobId: job.id } });
  }

  private createResearchRouter(): import('express').Router {
    const router = Router();
    const self = this;

    router.post('/', (req: any, res: any) => {
      const { question, depth = 'deep' } = req.body;
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'question required' });
      }
      const job: ResearchJob = {
        id: crypto.randomUUID(),
        question,
        depth,
        status: 'planning',
        createdAt: Date.now(),
        progress: [],
      };
      self.researchJobs.set(job.id, job);
      audit('research.started', { jobId: job.id, question: job.question, depth: job.depth });
      res.status(202).json({ jobId: job.id, status: job.status });
    });

    router.get('/', (_req: any, res: any) => {
      const limit = Number(_req.query.limit) || 20;
      const offset = Number(_req.query.offset) || 0;
      const all = [...self.researchJobs.values()].sort((a, b) => b.createdAt - a.createdAt);
      res.json({ jobs: all.slice(offset, offset + limit), total: all.length });
    });

    router.get('/:jobId', (req: any, res: any) => {
      const job = self.researchJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'not found' });
      res.json(job);
    });

    router.delete('/:jobId', (req: any, res: any) => {
      const job = self.researchJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'not found' });
      if (job.status === 'completed' || job.status === 'failed') {
        return res.status(409).json({ error: 'job already finished' });
      }
      job.status = 'cancelled';
      audit('research.cancelled', { jobId: job.id });
      res.json({ jobId: job.id, status: 'cancelled' });
    });

    router.get('/:jobId/sources', (req: any, res: any) => {
      const job = self.researchJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'not found' });
      res.json({ sources: job.report?.sources ?? [] });
    });

    return router;
  }

  private createAmbientRouter(): import('express').Router {
    const router = Router();
    const self = this;

    function guard(res: any): boolean {
      if (!self.ambientEngine || !self.ambientNotifications) {
        res.status(503).json({ error: 'Ambient system not available' });
        return false;
      }
      return true;
    }

    // Pattern management
    router.get('/patterns', (_req: any, res: any) => {
      if (!guard(res)) return;
      res.json({ patterns: self.ambientEngine!.getPatterns() });
    });

    router.get('/patterns/:id', (req: any, res: any) => {
      if (!guard(res)) return;
      const pattern = self.ambientEngine!.getPattern(req.params.id);
      if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
      res.json(pattern);
    });

    router.post('/patterns/detect', async (_req: any, res: any) => {
      if (!guard(res)) return;
      const detected = self.ambientEngine!.detectPatterns();
      await audit('ambient.patterns.detected', { count: detected.length });
      res.json({ detected: detected.length });
    });

    router.delete('/patterns', async (_req: any, res: any) => {
      if (!guard(res)) return;
      self.ambientEngine!.reset();
      await audit('ambient.patterns.reset', {});
      res.json({ ok: true });
    });

    // Anticipations
    router.get('/anticipations', (_req: any, res: any) => {
      if (!self.anticipationEngine) return res.status(503).json({ error: 'Anticipation engine not available' });
      res.json({ anticipations: self.anticipationEngine.getAnticipations() });
    });

    // Notifications
    router.get('/notifications', (req: any, res: any) => {
      if (!guard(res)) return;
      const priority = req.query.priority as string | undefined;
      const items = priority
        ? self.ambientNotifications!.getByPriority(priority as any)
        : self.ambientNotifications!.getQueue();
      res.json({ notifications: items });
    });

    router.post('/notifications/:id/dismiss', (req: any, res: any) => {
      if (!guard(res)) return;
      const ok = self.ambientNotifications!.dismiss(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Notification not found' });
      res.json({ ok: true });
    });

    router.get('/notifications/stats', (_req: any, res: any) => {
      if (!guard(res)) return;
      res.json({ pending: self.ambientNotifications!.getPendingCount() });
    });

    // Scheduler control
    router.get('/scheduler/status', (_req: any, res: any) => {
      if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
      res.json({ running: self.ambientScheduler.isRunning(), config: self.ambientScheduler.getConfig() });
    });

    router.post('/scheduler/start', async (_req: any, res: any) => {
      if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
      self.ambientScheduler.start();
      await audit('ambient.scheduler.started', {});
      res.json({ ok: true });
    });

    router.post('/scheduler/stop', async (_req: any, res: any) => {
      if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
      self.ambientScheduler.stop();
      await audit('ambient.scheduler.stopped', {});
      res.json({ ok: true });
    });

    router.put('/scheduler/config', (_req: any, res: any) => {
      if (!self.ambientScheduler) return res.status(503).json({ error: 'Scheduler not available' });
      res.json({ config: self.ambientScheduler.getConfig() });
    });

    return router;
  }

  private createVoiceRouter(): import('express').Router {
    const router = Router();

    router.get('/status', (_req: any, res: any) => {
      try {
        if (!this.voiceManager) {
          return res.json({ enabled: false });
        }
        res.json({ enabled: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/sessions/:clientId', (req: any, res: any) => {
      try {
        if (!this.voiceManager) {
          return res.status(503).json({ error: 'Voice not initialized' });
        }
        const active = this.voiceManager.hasActiveSession(req.params.clientId);
        res.json({ active });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }

  private createWebhooksRouter(): import('express').Router {
    const router = Router();

    router.get('/', async (_req: any, res: any) => {
      if (!this.webhookManager) return res.status(503).json({ error: 'Webhooks not configured' });
      try {
        const webhooks = await this.webhookManager.list();
        res.json({ webhooks });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/', async (req: any, res: any) => {
      if (!this.webhookManager) return res.status(503).json({ error: 'Webhooks not configured' });
      try {
        const webhook = await this.webhookManager.create(req.body);
        res.json(webhook);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.put('/:id', async (req: any, res: any) => {
      if (!this.webhookManager) return res.status(503).json({ error: 'Webhooks not configured' });
      try {
        const updated = await this.webhookManager.update(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: 'Webhook not found' });
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.delete('/:id', async (req: any, res: any) => {
      if (!this.webhookManager) return res.status(503).json({ error: 'Webhooks not configured' });
      try {
        const deleted = await this.webhookManager.delete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Webhook not found' });
        res.json({ deleted: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }

  private createConsciousnessRouter(): import('express').Router {
    const router = Router();
    const self = this;

    router.get('/pulse', (_req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const pulse = self.consciousness.monitor.getPulse();
        res.json(pulse);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/self-model', async (_req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const snapshot = await self.consciousness.model.synthesize();
        res.json(snapshot);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/journal/sessions', async (req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const limit = Number(req.query.limit) || 10;
        const sessions = await self.consciousness.journal.getRecentSessions(limit);
        res.json(sessions);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/journal/sessions/:sessionId', async (req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const session = await self.consciousness.journal.getSession(req.params.sessionId);
        res.json(session);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/repairs', async (req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const limit = Number(req.query.limit) || 20;
        const history = await self.consciousness.repair.getRepairHistory(limit);
        res.json(history);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/repairs/pending', async (_req: any, res: any) => {
      if (!self.consciousness) return res.status(503).json({ error: 'Consciousness not initialized' });
      try {
        const pending = await self.consciousness.repair.getPendingApprovals();
        res.json(pending);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createAgentProtocolRouter(): import('express').Router {
    const router = Router();

    router.get('/identity', (_req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const identity = this.agentProtocol.getIdentity();
        res.json(identity);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/inbox', (_req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const limit = _req.query.limit ? parseInt(_req.query.limit as string, 10) : 50;
        const messages = this.agentProtocol.getInbox(limit);
        res.json({ messages });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/messages', async (req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const { to, type, payload, replyTo } = req.body;
        const message = await this.agentProtocol.send(to, type, payload, replyTo);
        res.json(message);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.post('/receive', async (req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const response = await this.agentProtocol.receive(req.body);
        res.json(response ?? { accepted: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/directory', async (_req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const agents = await this.agentDirectory.listAll();
        res.json({ agents });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    router.get('/directory/search', async (req: any, res: any) => {
      if (!this.agentProtocol || !this.agentDirectory) {
        return res.status(503).json({ error: 'Agent protocol not initialized' });
      }
      try {
        const results = await this.agentDirectory.search(req.query.q as string);
        res.json({ results });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }

  private createTrustRouter(): import('express').Router {
    const router = Router();
    const self = this;

    router.get('/levels', (_req: any, res: any) => {
      if (!self.trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
      try {
        const levels = self.trustEngine.getAllLevels();
        res.json({ levels });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/levels/:domain', (_req: any, res: any) => {
      if (!self.trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
      try {
        const domain = _req.params.domain;
        const level = self.trustEngine.getTrustLevel(domain);
        const evidence = self.trustEngine.getEvidence(domain);
        res.json({ domain, level, evidence });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.put('/levels/:domain', async (req: any, res: any) => {
      if (!self.trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
      try {
        const domain = req.params.domain;
        const { level, reason } = req.body;
        await self.trustEngine.setTrustLevel(domain, level, reason);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/audit', (_req: any, res: any) => {
      if (!self.trustEngine) return res.status(503).json({ error: 'Trust engine not initialized' });
      try {
        const history = self.trustAuditTrail ? self.trustAuditTrail.getAll() : [];
        res.json({ history });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createWorkflowRouter(): import('express').Router {
    const router = Router();
    const self = this;

    // Static routes MUST come before parameterized /:id routes

    // GET / — list all workflows
    router.get('/', async (_req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const workflows = await self.workflowEngine.listAll();
        res.json({ workflows });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST / — create workflow
    router.post('/', async (req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const workflow = await self.workflowEngine.createWorkflow(req.body);
        res.json(workflow);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /active — list active workflows
    router.get('/active', async (_req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const workflows = await self.workflowEngine.listActive();
        res.json({ workflows });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /approvals/pending — list pending approvals
    router.get('/approvals/pending', async (req: any, res: any) => {
      if (!self.approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const approvals = await self.approvalManager.getPending(req.query.userId);
        res.json({ approvals });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /approvals/:id/approve
    router.post('/approvals/:id/approve', async (req: any, res: any) => {
      if (!self.approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const approval = await self.approvalManager.approve(req.params.id, req.body.decidedBy, req.body.reason);
        if (!approval) return res.status(404).json({ error: 'Approval not found' });
        res.json(approval);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /approvals/:id/reject
    router.post('/approvals/:id/reject', async (req: any, res: any) => {
      if (!self.approvalManager) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const rejection = await self.approvalManager.reject(req.params.id, req.body.decidedBy, req.body.reason);
        if (!rejection) return res.status(404).json({ error: 'Approval not found' });
        res.json(rejection);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id — get workflow by ID
    router.get('/:id', async (req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const workflow = await self.workflowEngine.getWorkflow(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
        res.json(workflow);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id/status — get workflow status
    router.get('/:id/status', async (req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const status = await self.workflowEngine.getStatus(req.params.id);
        if (!status) return res.status(404).json({ error: 'Workflow not found' });
        res.json(status);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /:id/start — start workflow
    router.post('/:id/start', async (req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const workflow = await self.workflowEngine.startWorkflow(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
        res.json(workflow);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /:id/cancel — cancel workflow
    router.post('/:id/cancel', async (req: any, res: any) => {
      if (!self.workflowEngine) return res.status(503).json({ error: 'Workflow engine not initialized' });
      try {
        const result = await self.workflowEngine.cancelWorkflow(req.params.id);
        if (!result) return res.status(404).json({ error: 'Workflow not found' });
        res.json({ cancelled: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }

  private createUpdateRouter(): import('express').Router {
    const router = Router();
    const self = this;

    // GET /status — installation info + current version
    router.get('/status', async (_req: any, res: any) => {
      if (!self.installationDetector || !self.versionChecker) {
        return res.status(503).json({ error: 'Update system not initialized' });
      }
      try {
        const info = self.installationDetector.detect();
        res.json({
          method: info.method,
          currentVersion: info.currentVersion,
          installPath: info.installPath,
          canSelfUpdate: info.canSelfUpdate,
          requiresSudo: info.requiresSudo,
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /check — check for available updates
    router.post('/check', async (req: any, res: any) => {
      if (!self.installationDetector || !self.versionChecker) {
        return res.status(503).json({ error: 'Update system not initialized' });
      }
      try {
        const channel = (req.body?.channel ?? 'stable') as UpdateChannel;
        const info = self.installationDetector.detect();
        const result = await self.versionChecker.check(info.currentVersion, channel);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /apply — trigger an update
    router.post('/apply', async (req: any, res: any) => {
      if (!self.updater) {
        return res.status(503).json({ error: 'Update system not initialized' });
      }
      try {
        const channel = (req.body?.channel ?? 'stable') as UpdateChannel;
        const result = await self.updater.update(channel);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /rollback — rollback a staged update
    router.post('/rollback', async (_req: any, res: any) => {
      if (!self.updater) {
        return res.status(503).json({ error: 'Update system not initialized' });
      }
      try {
        await self.updater.rollback();
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createConnectorRouter(): import('express').Router {
    const router = Router();

    // GET / — list all connectors
    router.get('/', (_req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      try {
        res.json({ connectors: this.connectorRegistry.list() });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id — get connector by id
    router.get('/:id', (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      try {
        const connector = this.connectorRegistry.get(req.params.id);
        if (!connector) return res.status(404).json({ error: 'Connector not found' });
        res.json(connector);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id/actions — get actions for connector
    router.get('/:id/actions', (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      try {
        if (!this.connectorRegistry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
        const actions = this.connectorRegistry.getActions(req.params.id);
        res.json({ actions });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id/triggers — get triggers for connector
    router.get('/:id/triggers', (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      try {
        if (!this.connectorRegistry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
        const triggers = this.connectorRegistry.getTriggers(req.params.id);
        res.json({ triggers });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /:id/authenticate — authenticate connector
    router.post('/:id/authenticate', async (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      if (!this.connectorAuthManager) return res.status(503).json({ error: 'Auth manager not configured' });
      try {
        if (!this.connectorRegistry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
        await this.connectorAuthManager.authenticate(req.params.id, req.params.id, req.body.credentials);
        res.json({ authenticated: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /:id/disconnect — revoke connector token
    router.post('/:id/disconnect', async (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      if (!this.connectorAuthManager) return res.status(503).json({ error: 'Auth manager not configured' });
      try {
        if (!this.connectorRegistry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
        await this.connectorAuthManager.revokeToken(req.params.id);
        res.json({ disconnected: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /:id/status — get connector auth status
    router.get('/:id/status', (req: any, res: any) => {
      if (!this.connectorRegistry) return res.status(503).json({ error: 'Connectors not configured' });
      if (!this.connectorAuthManager) return res.status(503).json({ error: 'Auth manager not configured' });
      try {
        if (!this.connectorRegistry.has(req.params.id)) return res.status(404).json({ error: 'Connector not found' });
        res.json({
          connected: this.connectorAuthManager.hasToken(req.params.id),
          expired: this.connectorAuthManager.isTokenExpired(req.params.id),
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    return router;
  }

  private createImageRouter(): import('express').Router {
    const router = Router();

    router.get('/providers', (_req: any, res: any) => {
      const providers = this.imageGenManager!.listProviders();
      const details = providers.map((name: ImageProvider) => {
        const p = this.imageGenManager!.getProvider(name);
        return {
          name,
          supportedSizes: p?.supportedSizes ?? [],
          supportedFormats: p?.supportedFormats ?? [],
          defaultModel: p?.defaultModel ?? '',
        };
      });
      res.json({ providers: details });
    });

    router.post('/generate', async (req: any, res: any) => {
      const { prompt, size, format, provider, negativePrompt, count, model, seed, style } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt required' });
      }
      const request: ImageGenRequest = {
        prompt,
        ...(size && { size }),
        ...(format && { format }),
        ...(provider && { provider }),
        ...(negativePrompt && { negativePrompt }),
        ...(count && { count }),
        ...(model && { model }),
        ...(seed !== undefined && { seed }),
        ...(style && { style }),
      };
      const result = await this.imageGenManager!.generate(request);
      if (!result.success) {
        return res.status(502).json({ error: result.error, durationMs: result.durationMs });
      }
      res.json(result);
    });

    return router;
  }

  private createRagRouter(): import('express').Router {
    const router = Router();

    router.get('/documents', (_req: any, res: any) => {
      res.json({ documents: this.documentStore!.listDocuments() });
    });

    router.post('/documents', (req: any, res: any) => {
      const { title, content, type, metadata } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'title required' });
      }
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content required' });
      }
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ error: 'type required' });
      }
      const doc = this.documentStore!.ingest(title, content, type as 'text' | 'markdown' | 'html' | 'json' | 'csv', metadata);
      res.status(201).json(doc);
    });

    router.get('/documents/:id', (req: any, res: any) => {
      const doc = this.documentStore!.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ error: 'document not found' });
      res.json(doc);
    });

    router.delete('/documents/:id', (req: any, res: any) => {
      const doc = this.documentStore!.getDocument(req.params.id);
      if (!doc) return res.status(404).json({ error: 'document not found' });
      this.documentStore!.removeDocument(req.params.id);
      res.json({ deleted: true });
    });

    router.post('/search', (req: any, res: any) => {
      const { query, limit, minScore, type } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query required' });
      }
      const results = this.documentStore!.search(query, { limit, minScore, type });
      res.json({ results });
    });

    router.post('/context', (req: any, res: any) => {
      const { query, maxTokens, maxChunks } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query required' });
      }
      const context = this.contextBuilder!.buildContext(query, this.documentStore!, { maxTokens, maxChunks });
      res.json({ context });
    });

    router.get('/stats', (_req: any, res: any) => {
      res.json(this.documentStore!.stats());
    });

    return router;
  }

  private createMcpRouter(): import('express').Router {
    const router = Router();

    router.get('/servers', (_req: any, res: any) => {
      if (!this.mcpClientManager) {
        return res.json({ servers: {} });
      }
      const status = this.mcpClientManager.getStatus();
      const servers: Record<string, { state: string; toolCount: number }> = {};
      for (const [name, s] of status) {
        servers[name] = s;
      }
      res.json({ servers });
    });

    router.post('/servers/:name/connect', async (req: any, res: any) => {
      if (!this.mcpClientManager) {
        return res.status(503).json({ error: 'MCP not configured' });
      }
      try {
        await this.mcpClientManager.connect(req.params.name);
        await audit('connector.connected', { connector: req.params.name, type: 'mcp' });
        res.json({ status: 'connected' });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.post('/servers/:name/disconnect', async (req: any, res: any) => {
      if (!this.mcpClientManager) {
        return res.status(503).json({ error: 'MCP not configured' });
      }
      try {
        await this.mcpClientManager.disconnect(req.params.name);
        await audit('connector.disconnected', { connector: req.params.name, type: 'mcp' });
        res.json({ status: 'disconnected' });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/servers/:name/tools', (req: any, res: any) => {
      if (!this.mcpClientManager) {
        return res.status(503).json({ error: 'MCP not configured' });
      }
      const tools = this.mcpClientManager.getToolsForServer(req.params.name);
      res.json({ tools });
    });

    return router;
  }

  private createEvalRouter(): import('express').Router {
    const router = Router();

    // GET /history/:suiteName — returns suite run history
    router.get('/history/:suiteName', (_req: any, res: any) => {
      if (!this.evalStore) {
        return res.status(503).json({ error: 'Evaluation system not initialized' });
      }
      try {
        const history = this.evalStore.getHistory(_req.params.suiteName);
        res.json({ history });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /latest/:suiteName — returns latest suite result or 404
    router.get('/latest/:suiteName', (_req: any, res: any) => {
      if (!this.evalStore) {
        return res.status(503).json({ error: 'Evaluation system not initialized' });
      }
      try {
        const latest = this.evalStore.getLatest(_req.params.suiteName);
        if (!latest) {
          return res.status(404).json({ error: 'No results found for suite' });
        }
        res.json(latest);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /trend/:suiteName/:metricName — returns score trend for a metric
    router.get('/trend/:suiteName/:metricName', (_req: any, res: any) => {
      if (!this.evalStore) {
        return res.status(503).json({ error: 'Evaluation system not initialized' });
      }
      try {
        const trend = this.evalStore.getTrend(_req.params.suiteName, _req.params.metricName);
        res.json({ trend });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /run — run evaluation suite
    router.post('/run', async (req: any, res: any) => {
      if (!this.evalRunner || !this.evalStore) {
        return res.status(503).json({ error: 'Evaluation system not initialized' });
      }
      try {
        const { suiteName, cases, mode } = req.body as {
          suiteName?: string;
          cases?: EvalCase[];
          mode?: string;
        };
        if (!suiteName || !cases || !Array.isArray(cases) || cases.length === 0) {
          return res.status(400).json({ error: 'suiteName and non-empty cases array required' });
        }
        const handler: (input: string) => Promise<string> =
          mode === 'echo' || !mode
            ? async (input: string) => input
            : async (input: string) => input;
        const result = await this.evalRunner.runSuite(suiteName, cases, handler);
        this.evalStore.record(result);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /compare — compare latest results of two suites
    router.post('/compare', (_req: any, res: any) => {
      if (!this.evalRunner || !this.evalStore) {
        return res.status(503).json({ error: 'Evaluation system not initialized' });
      }
      try {
        const { suiteNameA, suiteNameB } = _req.body as {
          suiteNameA?: string;
          suiteNameB?: string;
        };
        if (!suiteNameA || !suiteNameB) {
          return res.status(400).json({ error: 'suiteNameA and suiteNameB required' });
        }
        const latestA = this.evalStore.getLatest(suiteNameA);
        const latestB = this.evalStore.getLatest(suiteNameB);
        if (!latestA) {
          return res.status(404).json({ error: `No results found for suite: ${suiteNameA}` });
        }
        if (!latestB) {
          return res.status(404).json({ error: `No results found for suite: ${suiteNameB}` });
        }
        const comparison = this.evalRunner.compareSuites(latestA, latestB);
        res.json(comparison);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createCodeRouter(): import('express').Router {
    const router = Router();

    // POST /execute — one-shot code execution (no session required)
    router.post('/execute', async (req: any, res: any) => {
      try {
        const { language, code, timeout } = req.body as {
          language?: string;
          code?: string;
          timeout?: number;
        };
        if (!language || typeof language !== 'string') {
          return res.status(400).json({ error: 'language required' });
        }
        if (!code || typeof code !== 'string') {
          return res.status(400).json({ error: 'code required' });
        }
        const validLanguages: Language[] = ['javascript', 'typescript', 'python', 'shell'];
        if (!validLanguages.includes(language as Language)) {
          return res.status(400).json({ error: `Invalid language. Allowed: ${validLanguages.join(', ')}` });
        }
        const result = await this.codeExecutor!.execute({
          language: language as Language,
          code,
          timeoutMs: timeout,
        });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /sessions — list active sessions
    router.get('/sessions', (_req: any, res: any) => {
      const sessions = this.codeSessionManager!.listSessions().map((s) => ({
        id: s.id,
        language: s.language,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        historyLength: s.history.length,
      }));
      res.json({ sessions });
    });

    // POST /sessions — create a new REPL session
    router.post('/sessions', (req: any, res: any) => {
      try {
        const { language } = req.body as { language?: string };
        if (!language || typeof language !== 'string') {
          return res.status(400).json({ error: 'language required' });
        }
        const validLanguages: Language[] = ['javascript', 'typescript', 'python', 'shell'];
        if (!validLanguages.includes(language as Language)) {
          return res.status(400).json({ error: `Invalid language. Allowed: ${validLanguages.join(', ')}` });
        }
        const session = this.codeSessionManager!.createSession(language as Language);
        res.status(201).json({
          id: session.id,
          language: session.language,
          createdAt: session.createdAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('Maximum number of sessions') ? 409 : 500;
        res.status(status).json({ error: message });
      }
    });

    // GET /sessions/:id — get session details
    router.get('/sessions/:id', (req: any, res: any) => {
      const session = this.codeSessionManager!.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'session not found' });
      }
      res.json({
        id: session.id,
        language: session.language,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        historyLength: session.history.length,
        history: session.history,
      });
    });

    // POST /sessions/:id/execute — execute code in a session
    router.post('/sessions/:id/execute', async (req: any, res: any) => {
      try {
        const { code } = req.body as { code?: string };
        if (!code || typeof code !== 'string') {
          return res.status(400).json({ error: 'code required' });
        }
        const result = await this.codeSessionManager!.execute(req.params.id, code);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return res.status(404).json({ error: message });
        }
        res.status(500).json({ error: message });
      }
    });

    // DELETE /sessions/:id — destroy a session
    router.delete('/sessions/:id', (req: any, res: any) => {
      const session = this.codeSessionManager!.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'session not found' });
      }
      this.codeSessionManager!.destroySession(req.params.id);
      res.json({ deleted: true });
    });

    return router;
  }

  private createBackupRouter(): import('express').Router {
    const router = Router();
    let nextId = 1;

    // POST /create — create a new backup
    router.post('/create', async (req: any, res: any) => {
      if (!this.backupManager) {
        return res.status(503).json({ error: 'Backup system not initialized' });
      }
      try {
        const { categories } = req.body as { categories?: DataCategory[] };
        const result = await this.backupManager.createBackup(categories);
        if (result.status === 'failed') {
          return res.status(500).json({ error: result.error ?? 'Backup failed' });
        }
        const id = `backup-${nextId++}`;
        this.backupStore.set(id, result);
        res.status(201).json({ id, ...result });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /list — list all stored backups
    router.get('/list', (_req: any, res: any) => {
      const backups = [...this.backupStore.entries()].map(([id, b]) => ({
        id,
        status: b.status,
        manifest: b.manifest,
      }));
      res.json({ backups });
    });

    // POST /restore — restore from a backup
    router.post('/restore', async (req: any, res: any) => {
      if (!this.backupManager) {
        return res.status(503).json({ error: 'Backup system not initialized' });
      }
      try {
        const { backupId, categories } = req.body as { backupId?: string; categories?: DataCategory[] };
        if (!backupId || typeof backupId !== 'string') {
          return res.status(400).json({ error: 'backupId required' });
        }
        const backup = this.backupStore.get(backupId);
        if (!backup) {
          return res.status(404).json({ error: 'Backup not found' });
        }
        const result = await this.backupManager.restore(backup, categories);
        if (result.status === 'failed') {
          return res.status(500).json({ error: result.error ?? 'Restore failed' });
        }
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // DELETE /:id — delete a stored backup
    router.delete('/:id', (req: any, res: any) => {
      const { id } = req.params;
      if (!this.backupStore.has(id)) {
        return res.status(404).json({ error: 'Backup not found' });
      }
      this.backupStore.delete(id);
      res.json({ deleted: true });
    });

    return router;
  }

  private createKnowledgeRouter(): import('express').Router {
    const router = Router();
    router.post('/entities', (req: any, res: any) => {
      const { name, type, properties, aliases } = req.body;
      if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
      if (!type || typeof type !== 'string') return res.status(400).json({ error: 'type required' });
      try {
        const node = this.knowledgeGraph!.addNode({ name, type: type as any, aliases: aliases ?? [], properties: properties ?? {}, confidence: 1.0 });
        res.status(201).json(node);
      } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    });
    router.get('/entities', (req: any, res: any) => {
      const query = req.query.query as string | undefined;
      if (query) {
        const extracted = this.entityLinker!.extractEntities(query);
        const nodes = extracted.map((e: { name: string }) => this.knowledgeGraph!.getNode(e.name)).filter(Boolean);
        return res.json({ entities: nodes });
      }
      return res.json({ entities: [], stats: this.knowledgeGraph!.stats() });
    });
    router.get('/entities/:id', (req: any, res: any) => {
      const node = this.knowledgeGraph!.getNode(req.params.id);
      if (!node) return res.status(404).json({ error: 'entity not found' });
      res.json(node);
    });
    router.delete('/entities/:id', (req: any, res: any) => {
      const node = this.knowledgeGraph!.getNode(req.params.id);
      if (!node) return res.status(404).json({ error: 'entity not found' });
      this.knowledgeGraph!.removeNode(node.id);
      res.json({ deleted: true });
    });
    router.post('/relations', (req: any, res: any) => {
      const { from, to, type, properties, weight, label, evidence } = req.body;
      if (!from || typeof from !== 'string') return res.status(400).json({ error: 'from required' });
      if (!to || typeof to !== 'string') return res.status(400).json({ error: 'to required' });
      if (!type || typeof type !== 'string') return res.status(400).json({ error: 'type required' });
      try {
        const edge = this.knowledgeGraph!.addEdge(from, to, type as any, { weight, label, evidence, properties });
        res.status(201).json(edge);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) return res.status(404).json({ error: message });
        res.status(500).json({ error: message });
      }
    });
    router.get('/relations', (req: any, res: any) => {
      const nodeId = req.query.nodeId as string | undefined;
      const direction = (req.query.direction as 'outgoing' | 'incoming' | 'both') ?? 'both';
      if (!nodeId) return res.status(400).json({ error: 'nodeId query parameter required' });
      const node = this.knowledgeGraph!.getNode(nodeId);
      if (!node) return res.status(404).json({ error: 'node not found' });
      res.json({ relations: this.knowledgeGraph!.getEdges(node.id, direction) });
    });
    router.post('/query', (req: any, res: any) => {
      const { startNode, relation, targetType, maxDepth, minConfidence } = req.body as Partial<GraphQuery>;
      try {
        res.json(this.knowledgeGraph!.query({ startNode, relation, targetType, maxDepth, minConfidence }));
      } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    });
    router.post('/extract', (req: any, res: any) => {
      const { text } = req.body;
      if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
      try {
        const result = this.entityLinker!.linkToGraph(text, this.knowledgeGraph!);
        res.json({ newNodes: result.newNodes, newEdges: result.newEdges });
      } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
    });
    router.get('/stats', (_req: any, res: any) => {
      res.json(this.knowledgeGraph!.stats());
    });
    return router;
  }

  private createAutomationRouter(): import('express').Router {
    const router = Router();

    router.post('/parse', (req: any, res: any) => {
      const { input } = req.body;
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: 'input required' });
      }
      const spec = this.nlIntentParser.parse(input);
      res.json({ spec });
    });

    router.post('/build', (req: any, res: any) => {
      const { spec } = req.body;
      if (!spec || typeof spec !== 'object') {
        return res.status(400).json({ error: 'spec required' });
      }
      try {
        const behavior = this.automationBuilder.build(spec);
        res.json({ behavior });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.post('/validate', (req: any, res: any) => {
      const { spec } = req.body;
      if (!spec || typeof spec !== 'object') {
        return res.status(400).json({ error: 'spec required' });
      }
      const result = this.automationBuilder.validate(spec, [], []);
      res.json({ result });
    });

    return router;
  }

  private createBranchRouter(): import('express').Router {
    const router = Router();

    const getOrCreateManager = (conversationId: string): BranchManager => {
      let mgr = this.branchManagers.get(conversationId);
      if (!mgr) {
        mgr = new BranchManager(conversationId);
        this.branchManagers.set(conversationId, mgr);
      }
      return mgr;
    };

    router.get('/:conversationId', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      res.json({ branches: mgr.listBranches(), active: mgr.getActiveBranch() });
    });

    router.post('/:conversationId/fork', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      const { messageId, label } = req.body;
      try {
        const branch = mgr.fork(messageId, label);
        res.status(201).json(branch);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.post('/:conversationId/switch', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      const { branchId } = req.body;
      if (!branchId || typeof branchId !== 'string') {
        return res.status(400).json({ error: 'branchId required' });
      }
      try {
        const branch = mgr.switchBranch(branchId);
        res.json(branch);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.get('/:conversationId/tree', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      res.json({ tree: mgr.getTree() });
    });

    router.post('/:conversationId/merge', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      const { sourceBranchId, targetBranchId } = req.body;
      if (!sourceBranchId || typeof sourceBranchId !== 'string') {
        return res.status(400).json({ error: 'sourceBranchId required' });
      }
      if (!targetBranchId || typeof targetBranchId !== 'string') {
        return res.status(400).json({ error: 'targetBranchId required' });
      }
      try {
        mgr.mergeBranch(sourceBranchId, targetBranchId);
        res.json({ merged: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    router.delete('/:conversationId/:branchId', (req: any, res: any) => {
      const mgr = getOrCreateManager(req.params.conversationId);
      try {
        mgr.deleteBranch(req.params.branchId);
        res.json({ deleted: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createApprovalQueueRouter(): import('express').Router {
    const router = Router();

    // GET / — list all approval requests
    router.get('/', (_req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      res.json(this.approvalQueue.listAll());
    });

    // GET /pending — list pending approval requests
    router.get('/pending', (_req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      res.json(this.approvalQueue.listPending());
    });

    // POST /expire — expire stale requests
    router.post('/expire', (_req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      const expired = this.approvalQueue.expireStale();
      res.json({ expired });
    });

    // GET /:id — get a specific approval request
    router.get('/:id', (req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      const request = this.approvalQueue.get(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Approval request not found' });
      }
      res.json(request);
    });

    // POST /:id/approve — approve a request
    router.post('/:id/approve', (req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      try {
        const { decidedBy } = req.body as { decidedBy?: string; reason?: string };
        const result = this.approvalQueue.approve(req.params.id, decidedBy);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return res.status(404).json({ error: message });
        }
        if (message.includes('already')) {
          return res.status(409).json({ error: message });
        }
        res.status(500).json({ error: message });
      }
    });

    // POST /:id/deny — deny a request
    router.post('/:id/deny', (req: any, res: any) => {
      if (!this.approvalQueue) {
        return res.status(503).json({ error: 'Approval queue not initialized' });
      }
      try {
        const { decidedBy, reason } = req.body as { decidedBy?: string; reason?: string };
        const result = this.approvalQueue.deny(req.params.id, reason, decidedBy);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) {
          return res.status(404).json({ error: message });
        }
        if (message.includes('already')) {
          return res.status(409).json({ error: message });
        }
        res.status(500).json({ error: message });
      }
    });

    return router;
  }

  private createVectorRouter(): import('express').Router {
    const router = Router();

    // GET /stats — get store statistics
    router.get('/stats', (_req: any, res: any) => {
      if (!this.vectorStore) {
        return res.status(503).json({ error: 'Vector store not initialized' });
      }
      res.json({ size: this.vectorStore.size() });
    });

    // POST / — add a vector entry
    router.post('/', (req: any, res: any) => {
      if (!this.vectorStore) {
        return res.status(503).json({ error: 'Vector store not initialized' });
      }
      try {
        const { id, vector, content, metadata } = req.body as {
          id?: string;
          vector?: number[];
          content?: string;
          metadata?: Record<string, unknown>;
        };
        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'id required' });
        }
        if (!vector || !Array.isArray(vector)) {
          return res.status(400).json({ error: 'vector required' });
        }
        const entry = this.vectorStore.add(id, vector, content ?? '', metadata);
        res.status(201).json(entry);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /search — search vectors
    router.post('/search', (req: any, res: any) => {
      if (!this.vectorStore) {
        return res.status(503).json({ error: 'Vector store not initialized' });
      }
      try {
        const { vector, limit, minScore } = req.body as {
          vector?: number[];
          limit?: number;
          minScore?: number;
        };
        if (!vector || !Array.isArray(vector)) {
          return res.status(400).json({ error: 'vector required' });
        }
        const results = this.vectorStore.search(vector, limit, minScore);
        res.json(results);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // GET /:id — get a vector entry by ID
    router.get('/:id', (req: any, res: any) => {
      if (!this.vectorStore) {
        return res.status(503).json({ error: 'Vector store not initialized' });
      }
      const entry = this.vectorStore.get(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: 'Vector entry not found' });
      }
      res.json(entry);
    });

    // DELETE /:id — remove a vector entry
    router.delete('/:id', (req: any, res: any) => {
      if (!this.vectorStore) {
        return res.status(503).json({ error: 'Vector store not initialized' });
      }
      const removed = this.vectorStore.remove(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: 'Vector entry not found' });
      }
      res.json({ deleted: true });
    });

    return router;
  }

  private createReactRouter(): import('express').Router {
    const router = Router();

    // POST /run — start a new ReAct loop
    router.post('/run', (req: any, res: any) => {
      const { goal, maxSteps } = req.body as { goal?: string; maxSteps?: number };
      if (!goal || typeof goal !== 'string') {
        return res.status(400).json({ error: 'goal is required' });
      }

      const id = crypto.randomUUID();
      const config: ReActConfig = {};
      if (maxSteps) {
        config.maxSteps = maxSteps;
      }

      const callbacks: ReActCallbacks = {
        think: async (g: string, history: ReActStep[]) => {
          // Simple stub: produce an answer after gathering context
          if (history.length > 0) {
            return { thought: `Analyzed goal: ${g}`, answer: `Completed goal: ${g}` };
          }
          return { thought: `Planning approach for: ${g}` };
        },
        executeTool: async (toolName: string, params: Record<string, unknown>) => {
          try {
            const result = await toolExecutor.execute(toolName, params, {
              sessionId: id,
              userId: 'react-loop',
            });
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (err) {
            return `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      };

      const loop = new ReActLoop(callbacks, config);
      this.reactLoops.set(id, loop);

      // Run async — do not await
      loop.run(goal).then((result) => {
        this.reactResults.set(id, result);
      }).catch(() => {
        // Errors captured in result
      });

      res.status(201).json({ id, status: loop.getStatus() });
    });

    // GET /:id/status — get loop status
    router.get('/:id/status', (req: any, res: any) => {
      const loop = this.reactLoops.get(req.params.id);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }
      const result = this.reactResults.get(req.params.id);
      res.json({ status: loop.getStatus(), result: result ?? null });
    });

    // GET /:id/steps — get loop steps
    router.get('/:id/steps', (req: any, res: any) => {
      const loop = this.reactLoops.get(req.params.id);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }
      res.json(loop.getSteps());
    });

    // POST /:id/pause — pause loop
    router.post('/:id/pause', (req: any, res: any) => {
      const loop = this.reactLoops.get(req.params.id);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }
      loop.pause();
      res.json({ status: loop.getStatus() });
    });

    // POST /:id/resume — resume loop
    router.post('/:id/resume', (req: any, res: any) => {
      const loop = this.reactLoops.get(req.params.id);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }
      loop.resume();
      res.json({ status: loop.getStatus() });
    });

    // POST /:id/abort — abort loop
    router.post('/:id/abort', (req: any, res: any) => {
      const loop = this.reactLoops.get(req.params.id);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }
      loop.abort(req.body?.reason);
      res.json({ status: loop.getStatus() });
    });

    return router;
  }

  private createA2ARouter(): import('express').Router {
    const router = Router();

    // GET /card — return this agent's capability card
    router.get('/card', (_req: any, res: any) => {
      if (!this.a2aAgentCard) {
        return res.status(503).json({ error: 'A2A not initialized' });
      }
      res.json(this.a2aAgentCard);
    });

    // POST /tasks — send a task (create via task manager)
    router.post('/tasks', (req: any, res: any) => {
      const { targetUrl, task } = req.body as { targetUrl?: string; task?: { message: string } };
      if (!task?.message) {
        return res.status(400).json({ error: 'task.message is required' });
      }

      const a2aTask = this.a2aTaskManager.createTask({
        role: 'user',
        parts: [{ type: 'text', text: task.message }],
        timestamp: Date.now(),
      });

      if (targetUrl) {
        // Store target URL as metadata for potential forwarding
        a2aTask.metadata = { targetUrl };
      }

      res.status(201).json(a2aTask);
    });

    // GET /tasks/:id — get task status
    router.get('/tasks/:id', (req: any, res: any) => {
      const task = this.a2aTaskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json(task);
    });

    // POST /tasks/:id/cancel — cancel task
    router.post('/tasks/:id/cancel', (req: any, res: any) => {
      const task = this.a2aTaskManager.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      try {
        this.a2aTaskManager.cancelTask(req.params.id);
        res.json(this.a2aTaskManager.getTask(req.params.id));
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }

  private createCanvasRouter(): import('express').Router {
    const router = Router();

    // GET /sessions — list all canvas sessions
    router.get('/sessions', (_req: any, res: any) => {
      const sessions = Array.from(this.canvasSessions.entries()).map(([id, s]) => ({
        id,
        objectCount: s.getObjects().length,
        size: s.getSize(),
        createdAt: s.createdAt,
      }));
      res.json({ sessions });
    });

    // POST /sessions — create a new canvas session
    router.post('/sessions', (req: any, res: any) => {
      const { width, height } = req.body as { width?: number; height?: number };
      const session = new CanvasSession({ width, height });
      this.canvasSessions.set(session.id, session);
      res.status(201).json({ id: session.id, ...session.getSize() });
    });

    // GET /sessions/:id — get session state
    router.get('/sessions/:id', (req: any, res: any) => {
      const session = this.canvasSessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ id: session.id, objects: session.getObjects(), size: session.getSize() });
    });

    // POST /sessions/:id/objects — add object
    router.post('/sessions/:id/objects', (req: any, res: any) => {
      const session = this.canvasSessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      try {
        const obj = session.addObject(req.body);
        res.status(201).json(obj);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // PUT /sessions/:id/objects/:objectId — update object
    router.put('/sessions/:id/objects/:objectId', (req: any, res: any) => {
      const session = this.canvasSessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const updated = session.updateObject(req.params.objectId, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Object not found' });
      }
      res.json(updated);
    });

    // DELETE /sessions/:id/objects/:objectId — remove object
    router.delete('/sessions/:id/objects/:objectId', (req: any, res: any) => {
      const session = this.canvasSessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const removed = session.removeObject(req.params.objectId);
      if (!removed) {
        return res.status(404).json({ error: 'Object not found' });
      }
      res.json({ deleted: true });
    });

    // DELETE /sessions/:id — delete session
    router.delete('/sessions/:id', (req: any, res: any) => {
      const existed = this.canvasSessions.delete(req.params.id);
      if (!existed) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ deleted: true });
    });

    return router;
  }

  private setupCanvasWebSocket(): void {
    const canvasWss = new CanvasWSS({ noServer: true });
    const CANVAS_WS_PATTERN = /^\/api\/v1\/canvas\/sessions\/([^/]+)\/ws/;
    const BROADCAST_EVENTS: CanvasEventType[] = [
      'object:added',
      'object:updated',
      'object:removed',
      'canvas:cleared',
      'canvas:resized',
    ];

    this.gateway.onUpgrade((req, socket, head) => {
      const url = req.url ?? '';
      const match = CANVAS_WS_PATTERN.exec(url);
      if (!match) return false;

      const sessionId = decodeURIComponent(match[1]);
      const session = this.canvasSessions.get(sessionId);
      if (!session) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return true;
      }

      canvasWss.handleUpgrade(req, socket, head, (ws) => {
        // Send initial snapshot
        const snapshot = session.snapshot();
        if (ws.readyState === CanvasWS.OPEN) {
          ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));
        }

        // Subscribe to session events and forward to the WS client
        const handlers: Array<{ event: CanvasEventType; handler: (evt: unknown) => void }> = [];
        for (const eventType of BROADCAST_EVENTS) {
          const handler = (evt: unknown) => {
            if (ws.readyState === CanvasWS.OPEN) {
              ws.send(JSON.stringify(evt));
            }
          };
          session.on(eventType, handler);
          handlers.push({ event: eventType, handler });
        }

        ws.on('close', () => {
          for (const { event, handler } of handlers) {
            session.off(event, handler);
          }
        });

        ws.on('error', () => {
          for (const { event, handler } of handlers) {
            session.off(event, handler);
          }
        });
      });

      return true;
    });
  }

  private createSandboxRouter(): import('express').Router {
    const router = Router();

    // POST /sessions — create a sandbox session
    router.post('/sessions', async (req: any, res: any) => {
      if (!this.sandboxManager) {
        return res.status(503).json({ error: 'Sandbox not initialized' });
      }
      const { workspaceDir } = req.body as { workspaceDir?: string };
      if (!workspaceDir || typeof workspaceDir !== 'string') {
        return res.status(400).json({ error: 'workspaceDir is required' });
      }
      try {
        const sessionId = crypto.randomUUID();
        const session = await this.sandboxManager.createSession(sessionId, workspaceDir);
        res.status(201).json(session.getInfo());
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    // POST /sessions/:id/run — run command in sandbox
    router.post('/sessions/:id/run', async (req: any, res: any) => {
      if (!this.sandboxManager) {
        return res.status(503).json({ error: 'Sandbox not initialized' });
      }
      const { command } = req.body as { command?: string[] };
      if (!command || !Array.isArray(command)) {
        return res.status(400).json({ error: 'command array is required' });
      }
      try {
        const result = await this.sandboxManager.runInSandbox(req.params.id, command);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('No sandbox session found')) {
          return res.status(404).json({ error: message });
        }
        res.status(500).json({ error: message });
      }
    });

    // GET /sessions/:id — get session info
    router.get('/sessions/:id', (req: any, res: any) => {
      if (!this.sandboxManager) {
        return res.status(503).json({ error: 'Sandbox not initialized' });
      }
      const session = this.sandboxManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session.getInfo());
    });

    // DELETE /sessions/:id — stop and remove
    router.delete('/sessions/:id', async (req: any, res: any) => {
      if (!this.sandboxManager) {
        return res.status(503).json({ error: 'Sandbox not initialized' });
      }
      try {
        const removed = await this.sandboxManager.destroySession(req.params.id);
        if (!removed) {
          return res.status(404).json({ error: 'Session not found' });
        }
        res.json({ deleted: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    return router;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (srcVal && tgtVal && typeof srcVal === 'object' && typeof tgtVal === 'object' && !Array.isArray(srcVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export {
  AgentRouter,
  AgentInstance,
  type AgentRoutingConfig,
  type AgentRoutingRule,
  type AgentConfig,
} from './agent-router.js';

export {
  BlockStream,
  ToolOutputStream,
  type BlockType,
  type ContentBlock,
  type BlockStreamEvent,
  type BlockStreamSender,
} from './block-stream.js';

export { SourceAttributor } from './source-attribution.js';
export type { Attribution, AttributedSegment, ResponseAttribution, AttributionSource, SourceType } from './source-attribution.js';

export { ConfidenceAssessor } from './confidence.js';
export type { ConfidenceLevel, KnowledgeSource, ConfidenceSignal, ConfidenceAssessment, UncertaintyMarker } from './confidence.js';

export { ResponseProvenanceTracker } from './response-provenance.js';
export type { ProvenanceEntry, ProvenanceSummary, ContextSignalRecord, ToolCallRecord } from './response-provenance.js';

export { UserModelExporter } from './user-model-export.js';
export type { UserModelView, DomainProfile, PreferenceItem, DecisionItem } from './user-model-export.js';

export { createReActJobHandler, createWorkflowJobHandler } from './queue-wiring.js';
export type { QueuedReActPayload, QueuedWorkflowPayload } from './queue-wiring.js';

export async function startAuxiora(options: AuxioraOptions = {}): Promise<Auxiora> {
  const auxiora = new Auxiora();
  await auxiora.initialize(options);
  await auxiora.start();
  return auxiora;
}
