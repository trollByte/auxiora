import { Gateway, type ClientConnection, type WsMessage } from '@auxiora/gateway';
import { SessionManager, type Message } from '@auxiora/sessions';
import { ProviderFactory, type StreamChunk, type ProviderMetadata, type ThinkingLevel, readClaudeCliCredentials, isSetupToken } from '@auxiora/providers';
import { ModelRouter, TaskClassifier, ModelSelector, CostTracker, type RoutingResult } from '@auxiora/router';
import { ChannelManager, type InboundMessage } from '@auxiora/channels';
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
  type ExecutionContext,
} from '@auxiora/tools';
import { OrchestrationEngine } from '@auxiora/orchestrator';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BehaviorManager } from '@auxiora/behaviors';
import { BrowserManager } from '@auxiora/browser';
import { VoiceManager } from '@auxiora/voice';
import { WhisperSTT } from '@auxiora/stt';
import { OpenAITTS } from '@auxiora/tts';
import { WebhookManager } from '@auxiora/webhooks';
import { createDashboardRouter } from '@auxiora/dashboard';
import { PluginLoader } from '@auxiora/plugins';
import {
  MemoryStore,
  MemoryRetriever,
  MemoryExtractor,
  PatternDetector,
  PersonalityAdapter,
} from '@auxiora/memory';
import { TrustEngine, ActionAuditTrail, RollbackManager, TrustGate } from '@auxiora/autonomy';
import { IntentParser, ActionPlanner } from '@auxiora/intent';
import { UserManager } from '@auxiora/social';
import { WorkflowEngine, ApprovalManager } from '@auxiora/workflows';
import { AgentProtocol, MessageSigner, AgentDirectory } from '@auxiora/agent-protocol';
import { AmbientPatternEngine, QuietNotificationManager, BriefingGenerator, AnticipationEngine, AmbientScheduler, DEFAULT_AMBIENT_SCHEDULER_CONFIG, NotificationOrchestrator } from '@auxiora/ambient';
import { NotificationHub, DoNotDisturbManager } from '@auxiora/notification-hub';
import { ConnectorRegistry, AuthManager as ConnectorAuthManager, TriggerManager } from '@auxiora/connectors';
import { googleWorkspaceConnector } from '@auxiora/connector-google-workspace';
import { ConversationEngine } from '@auxiora/conversation';
import { ScreenCapturer, ScreenAnalyzer } from '@auxiora/screen';
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
  type SessionModeState,
  type ModeId,
  type UserPreferences,
  type SecurityContext,
} from '@auxiora/personality';
import { getModesDir } from '@auxiora/core';
import { fileURLToPath } from 'node:url';

export interface AuxioraOptions {
  config?: Config;
  vaultPassword?: string;
}

export class Auxiora {
  private config!: Config;
  private gateway!: Gateway;
  private sessions!: SessionManager;
  private providers!: ProviderFactory;
  private channels?: ChannelManager;
  private vault!: Vault;
  private systemPrompt: string = '';
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
  private memoryCleanupInterval?: ReturnType<typeof setInterval>;
  private trustEngine?: TrustEngine;
  private trustAuditTrail?: ActionAuditTrail;
  private rollbackManager?: RollbackManager;
  private trustGate?: TrustGate;
  private intentParser?: IntentParser;
  private actionPlanner?: ActionPlanner;
  private orchestrationEngine?: OrchestrationEngine;
  // [P14] Team / Social
  private userManager?: UserManager;
  private workflowEngine?: WorkflowEngine;
  private approvalManager?: ApprovalManager;
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
  private notificationHub?: NotificationHub;
  private dndManager?: DoNotDisturbManager;
  private notificationOrchestrator?: NotificationOrchestrator;
  // Security floor
  private securityFloor?: SecurityFloor;
  private sessionEscalation: Map<string, EscalationStateMachine> = new Map();
  private orchestrationHistory: Array<{
    workflowId: string;
    pattern: string;
    taskCount: number;
    totalCost: number;
    duration: number;
    timestamp: number;
  }> = [];

  async initialize(options: AuxioraOptions = {}): Promise<void> {
    // Load config
    this.config = options.config || (await loadConfig());

    // Initialize vault (optional)
    this.vault = new Vault();
    if (options.vaultPassword) {
      try {
        await this.vault.unlock(options.vaultPassword);
      } catch (error) {
        console.warn('Failed to unlock vault:', error instanceof Error ? error.message : error);
      }
    }

    // Initialize tool system with approval callback
    initializeToolExecutor(async (toolName: string, params: any, context: ExecutionContext) => {
      // For now, auto-approve all tools in non-interactive mode
      // In future, could send approval request to client via WebSocket
      console.log(`[Tools] Auto-approving ${toolName} with params:`, params);
      return true;
    });

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
    }

    // Initialize orchestration engine (if enabled and providers available)
    if (this.providers && this.config.orchestration?.enabled !== false) {
      this.orchestrationEngine = new OrchestrationEngine(
        this.providers,
        this.config.orchestration ?? { enabled: true, maxConcurrentAgents: 5, defaultTimeout: 60000, totalTimeout: 300000, allowedPatterns: ['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor'], costMultiplierWarning: 3 },
      );
      setOrchestrationEngine(this.orchestrationEngine);
      console.log('Orchestration engine initialized');
    }

    // Initialize channels (if configured and vault is unlocked)
    await this.initializeChannels();

    // Load personality files
    await this.loadPersonality();

    // Initialize modes system
    await this.initializeModes();

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

    // Initialize behavior system
    if (this.providers) {
      this.behaviors = new BehaviorManager({
        storePath: getBehaviorsPath(),
        executorDeps: {
          getProvider: () => this.providers.getPrimaryProvider() as any,
          sendToChannel: async (channelType: string, channelId: string, message: { content: string }) => {
            if (this.channels) {
              return this.channels.send(channelType as any, channelId, message);
            }
            return { success: false, error: 'Channel not available for proactive delivery' };
          },
          getSystemPrompt: () => this.systemPrompt,
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

    // Initialize voice system (if enabled and OpenAI key available)
    if (this.config.voice?.enabled) {
      let openaiKeyForVoice: string | undefined;
      try {
        openaiKeyForVoice = this.vault.get('OPENAI_API_KEY');
      } catch {
        // Vault locked
      }

      if (openaiKeyForVoice) {
        this.voiceManager = new VoiceManager({
          sttProvider: new WhisperSTT({ apiKey: openaiKeyForVoice }),
          ttsProvider: new OpenAITTS({
            apiKey: openaiKeyForVoice,
            defaultVoice: this.config.voice.defaultVoice,
          }),
          config: {
            enabled: true,
            defaultVoice: this.config.voice.defaultVoice,
            language: this.config.voice.language,
            maxAudioDuration: this.config.voice.maxAudioDuration,
            sampleRate: this.config.voice.sampleRate,
          },
        });
        this.gateway.onVoiceMessage(this.handleVoiceMessage.bind(this));
        console.log('Voice mode enabled');
      } else {
        console.warn('Voice mode enabled in config but no OPENAI_API_KEY found in vault');
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
      console.log('Webhook listeners enabled');
    }

    // Initialize dashboard (if enabled)
    if (this.config.dashboard?.enabled) {
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
                console.log('Channels connected after vault unlock');
              }
            }
          },
          behaviors: this.behaviors ? {
            list: (filter?: { type?: string; status?: string }) => this.behaviors!.list(filter as any),
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
          getConnections: () => this.gateway.getConnections(),
          getAuditEntries: async (limit?: number) => {
            const auditLogger = getAuditLogger();
            return auditLogger.getEntries(limit);
          },
          getPlugins: () => this.pluginLoader?.listPlugins() ?? [],
          getMemories: async () => this.memoryStore?.getAll() ?? [],
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
          },
          trust: this.trustEngine && this.trustAuditTrail && this.rollbackManager ? {
            getLevels: () => this.trustEngine!.getAllLevels(),
            getLevel: (domain: string) => this.trustEngine!.getTrustLevel(domain as any),
            setLevel: async (domain: string, level: number, reason: string) => {
              await this.trustEngine!.setTrustLevel(domain as any, level as any, reason);
            },
            getAuditEntries: (limit?: number) => this.trustAuditTrail!.query({ limit }),
            getAuditEntry: (id: string) => this.trustAuditTrail!.getById(id),
            rollback: async (id: string) => this.rollbackManager!.rollback(id),
            getPromotions: () => this.trustEngine!.getPromotions(),
          } : undefined,
          // [P14] Team / Social
          team: this.userManager ? {
            listUsers: () => this.userManager!.listUsers(),
            createUser: (name: string, role: string, channels?: any[]) =>
              this.userManager!.createUser(name, role, { channels }),
            deleteUser: (id: string) => this.userManager!.deleteUser(id),
          } : undefined,
          // [P14] Workflows
          workflows: this.workflowEngine && this.approvalManager ? {
            listActive: () => this.workflowEngine!.listActive(),
            listAll: () => this.workflowEngine!.listAll(),
            getStatus: (id: string) => this.workflowEngine!.getStatus(id),
            createWorkflow: (options: any) => this.workflowEngine!.createWorkflow(options),
            completeStep: (wfId: string, stepId: string, completedBy: string) =>
              this.workflowEngine!.completeStep(wfId, stepId, completedBy),
            cancelWorkflow: (id: string) => this.workflowEngine!.cancelWorkflow(id),
            getPendingApprovals: (userId?: string) => this.approvalManager!.getPending(userId),
            approve: (id: string, userId: string, reason?: string) =>
              this.approvalManager!.approve(id, userId, reason),
            reject: (id: string, userId: string, reason?: string) =>
              this.approvalManager!.reject(id, userId, reason),
          } : undefined,
          // [P14] Agent Protocol
          agentProtocol: this.agentProtocol && this.agentDirectory ? {
            getIdentity: () => this.agentProtocol!.getIdentity(),
            getInbox: (limit?: number) => this.agentProtocol!.getInbox(limit),
            discover: (query: string) => this.agentProtocol!.discover(query),
            getDirectory: () => this.agentDirectory!.listAll(),
          } : undefined,
          // [P15] Screen
          screen: this.screenCapturer ? {
            capture: async () => {
              const cap = await this.screenCapturer!.captureScreen();
              return { image: cap.image.toString('base64'), dimensions: cap.dimensions };
            },
            analyze: async (question?: string) => {
              if (!this.screenAnalyzer) return 'Screen analyzer not available';
              const cap = await this.screenCapturer!.captureScreen();
              return this.screenAnalyzer.analyzeScreen(cap.image, question);
            },
          } : undefined,
          // [P15] Ambient
          ambient: this.ambientEngine && this.ambientNotifications ? {
            getPatterns: () => this.ambientEngine!.getPatterns(),
            getNotifications: () => this.ambientNotifications!.getQueue(),
            dismissNotification: (id: string) => this.ambientNotifications!.dismiss(id),
            getBriefing: (time: string) => {
              return this.briefingGenerator!.generateBriefing(
                'dashboard', time === 'evening' ? 'evening' : 'morning',
                {
                  patterns: this.ambientEngine!.getPatterns(),
                  notifications: this.ambientNotifications!.getQueue(),
                  anticipations: this.anticipationEngine!.getAnticipations(),
                },
              );
            },
            getAnticipations: () => this.anticipationEngine!.getAnticipations(),
          } : undefined,
          // [P15] Conversation
          conversation: this.conversationEngine ? {
            getState: () => this.conversationEngine!.getState(),
            start: () => this.conversationEngine!.start(),
            stop: () => this.conversationEngine!.stop(),
            getTurnCount: () => this.conversationEngine!.getTurnCount(),
          } : undefined,
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
            },
            getAgentName: () => this.config.agent?.name ?? 'Auxiora',
            getAgentPronouns: () => this.config.agent?.pronouns ?? 'they/them',
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
                console.log('Providers re-initialized after setup');
              }
              // Connect channels now that vault is unlocked with credentials
              await this.initializeChannels();
              const channels = this.channels;
              if (channels) {
                await channels.connectAll();
                console.log('Channels connected after setup');
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

      console.log('Dashboard enabled at /dashboard');
    }

    // Initialize plugin system (if enabled)
    if (this.config.plugins?.enabled !== false) {
      const pluginsDir = this.config.plugins?.dir || undefined;
      this.pluginLoader = new PluginLoader(pluginsDir);
      const loaded = await this.pluginLoader.loadAll();
      const successful = loaded.filter(p => p.status === 'loaded');
      if (loaded.length > 0) {
        console.log(`Plugins: ${successful.length} loaded, ${loaded.length - successful.length} failed`);
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
      if (this.providers) {
        this.memoryExtractor = new MemoryExtractor(
          this.memoryStore,
          this.providers.getPrimaryProvider(),
        );
      }

      // Set up periodic cleanup of expired memories
      const cleanupMinutes = this.config.memory?.cleanupIntervalMinutes;
      if (cleanupMinutes) {
        this.memoryCleanupInterval = setInterval(
          () => void this.memoryStore?.cleanExpired(),
          cleanupMinutes * 60 * 1000,
        );
      }

      console.log('Memory system enabled (living memory)');
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
      console.log('Trust engine initialized');
    }

    // Initialize intent parser (if enabled)
    if (this.config.intent?.enabled !== false) {
      this.intentParser = new IntentParser({
        confidenceThreshold: this.config.intent?.confidenceThreshold ?? 0.3,
      });
      this.actionPlanner = new ActionPlanner();
      console.log('Intent parser initialized');
    }

    // [P14] Initialize team / social system
    this.userManager = new UserManager();
    this.workflowEngine = new WorkflowEngine();
    this.approvalManager = new ApprovalManager();
    console.log('Team/social system initialized');

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
    console.log('Agent protocol initialized');

    // [P15] Initialize ambient intelligence
    this.ambientEngine = new AmbientPatternEngine();
    this.ambientNotifications = new QuietNotificationManager();
    this.briefingGenerator = new BriefingGenerator();
    this.anticipationEngine = new AnticipationEngine();
    console.log('Ambient intelligence initialized');

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
        if (this.channels) {
          for (const channelType of this.channels.getConnectedChannels()) {
            try {
              void this.channels.send(channelType as any, 'system', { content: notification.message });
            } catch {
              // Channel delivery failure is non-fatal
            }
          }
        }
      },
    );
    console.log('Notification orchestrator initialized');

    // Initialize connector registry and wire ambient scheduler
    this.connectorRegistry = new ConnectorRegistry();
    this.connectorAuthManager = new ConnectorAuthManager();
    this.connectorRegistry.register(googleWorkspaceConnector);
    this.triggerManager = new TriggerManager(this.connectorRegistry, this.connectorAuthManager);

    // Restore connector tokens from vault
    try {
      for (const connector of this.connectorRegistry.list()) {
        const tokenData = this.vault.get(`connectors.${connector.id}.tokens`);
        if (tokenData) {
          const tokens = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
          await this.connectorAuthManager.authenticate(connector.id, connector.auth, tokens);
        }
      }
    } catch {
      // Vault locked or no tokens stored
    }

    // Register connector actions as AI-callable tools
    this.registerConnectorTools();

    // Wire ambient scheduler if Google Workspace has a stored token
    if (this.connectorAuthManager.hasToken('google-workspace') && this.briefingGenerator) {
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
          // Send to all connected channels
          if (this.channels) {
            for (const channelType of this.channels.getConnectedChannels()) {
              try {
                await this.channels.send(channelType as any, 'system', { content: msg });
              } catch {
                // Channel delivery failure is non-fatal
              }
            }
          }
        },
        userId: 'default',
        config: DEFAULT_AMBIENT_SCHEDULER_CONFIG,
      });
      this.ambientScheduler.start();
      console.log('Ambient scheduler started (Google Workspace connected)');
    }

    // [P15] Initialize conversation engine
    this.conversationEngine = new ConversationEngine();
    console.log('Conversation engine initialized');

    // [P15] Initialize screen system (with mock backends — real backends injected at desktop layer)
    const mockCaptureBackend: CaptureBackend = {
      captureScreen: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
      captureRegion: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
      captureWindow: async () => ({ image: Buffer.alloc(0), timestamp: Date.now(), dimensions: { width: 0, height: 0 } }),
    };
    this.screenCapturer = new ScreenCapturer(mockCaptureBackend);
    console.log('Screen system initialized (capture backend: mock)');
  }

  private async initializeProviders(): Promise<void> {
    let anthropicKey: string | undefined;
    let anthropicOAuthToken: string | undefined;
    let openaiKey: string | undefined;
    let googleKey: string | undefined;
    let vaultLocked = false;

    try {
      anthropicKey = this.vault.get('ANTHROPIC_API_KEY');
      anthropicOAuthToken = this.vault.get('ANTHROPIC_OAUTH_TOKEN');
      openaiKey = this.vault.get('OPENAI_API_KEY');
      googleKey = this.vault.get('GOOGLE_API_KEY');

      // Check if ANTHROPIC_API_KEY is actually an OAuth token (sk-ant-oat01-*)
      // This handles users who stored their OAuth token in the wrong vault key
      if (anthropicKey && isSetupToken(anthropicKey)) {
        anthropicOAuthToken = anthropicKey;
        anthropicKey = undefined;
      }
    } catch {
      vaultLocked = true;
    }

    // Check for Claude CLI credentials as fallback
    const cliCreds = readClaudeCliCredentials();
    const hasCliCredentials = cliCreds !== null;

    const hasAnthropic = anthropicKey || anthropicOAuthToken || hasCliCredentials;
    const hasOllama = this.config.provider.ollama?.model;
    if (!hasAnthropic && !openaiKey && !googleKey && !hasOllama) {
      if (vaultLocked) {
        console.warn('Vault is locked. AI providers not initialized.');
        console.warn('To use AI: auxiora vault add ANTHROPIC_API_KEY');
      } else {
        console.warn('No API keys found in vault. Add with: auxiora vault add ANTHROPIC_API_KEY');
        console.warn('Or for Claude Pro/Max OAuth: auxiora vault add ANTHROPIC_OAUTH_TOKEN');
        console.warn('Or authenticate with: claude setup-token');
      }
      return;
    }

    // Build Anthropic config - prefer vault credentials, fall back to CLI
    let anthropicConfig: {
      apiKey?: string;
      oauthToken?: string;
      useCliCredentials?: boolean;
      model: string;
      maxTokens: number;
    } | undefined;

    if (anthropicOAuthToken) {
      const tokenPrefix = anthropicOAuthToken.substring(0, 15);
      console.log(`Using Anthropic OAuth token from vault (${tokenPrefix}...)`);
      anthropicConfig = {
        oauthToken: anthropicOAuthToken,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    } else if (anthropicKey) {
      console.log('Using Anthropic API key from vault');
      anthropicConfig = {
        apiKey: anthropicKey,
        model: this.config.provider.anthropic.model,
        maxTokens: this.config.provider.anthropic.maxTokens,
      };
    } else if (hasCliCredentials) {
      console.log('Using Claude CLI credentials (~/.claude/.credentials.json)');
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
      },
    });
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
    console.log(`Model router initialized with ${availableProviders.size} provider(s)`);
  }

  getRouter(): ModelRouter | undefined {
    return this.modelRouter;
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

    try {
      discordToken = this.vault.get('DISCORD_BOT_TOKEN');
      telegramToken = this.vault.get('TELEGRAM_BOT_TOKEN');
      slackBotToken = this.vault.get('SLACK_BOT_TOKEN');
      slackAppToken = this.vault.get('SLACK_APP_TOKEN');
      twilioAccountSid = this.vault.get('TWILIO_ACCOUNT_SID');
      twilioAuthToken = this.vault.get('TWILIO_AUTH_TOKEN');
      twilioPhoneNumber = this.vault.get('TWILIO_PHONE_NUMBER');
    } catch {
      // Vault is locked
      return;
    }

    const hasAnyChannel =
      (this.config.channels.discord.enabled && discordToken) ||
      (this.config.channels.telegram.enabled && telegramToken) ||
      (this.config.channels.slack.enabled && slackBotToken && slackAppToken) ||
      (this.config.channels.twilio.enabled && twilioAccountSid && twilioAuthToken);

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
    });

    // Set up channel message handler
    this.channels.onMessage(this.handleChannelMessage.bind(this));
    this.channels.onError((error, channelType) => {
      console.error(`Channel error (${channelType}):`, error.message);
    });
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

  private async loadPersonality(): Promise<void> {
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
    try {
      const soul = await fs.readFile(getSoulPath(), 'utf-8');
      parts.push(soul);
    } catch {
      // No SOUL.md
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
      this.systemPrompt = parts.join('\n\n---\n\n');
    } else {
      // Only identity preamble, no personality files — use enriched default
      this.systemPrompt = `You are ${agent.name}, a helpful AI assistant. Be concise, accurate, and friendly.`;
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

  /** Build enriched prompt with auto-detection (shared by handleMessage and handleChannelMessage). */
  private buildModeEnrichedPrompt(content: string, modeState: SessionModeState, memorySection: string | null): string {
    if (modeState.activeMode === 'auto' && this.modeDetector && this.config.modes?.autoDetection !== false) {
      const detection = this.modeDetector.detect(content, { currentState: modeState });
      if (detection) {
        modeState.lastAutoMode = detection.mode;
        modeState.autoDetected = true;
        modeState.lastSwitchAt = Date.now();
        const tempState: SessionModeState = { ...modeState, activeMode: detection.mode };
        return this.promptAssembler!.enrichForMessage(tempState, memorySection, this.userPreferences);
      }
    }
    return this.promptAssembler!.enrichForMessage(modeState, memorySection, this.userPreferences);
  }

  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const { id: requestId, payload } = message;
    const msgPayload = payload as { content?: string; model?: string; provider?: string; thinkingLevel?: ThinkingLevel } | undefined;
    const content = msgPayload?.content;
    const modelOverride = msgPayload?.model;
    const providerOverride = msgPayload?.provider;
    const thinkingLevel = msgPayload?.thinkingLevel;

    if (!content || typeof content !== 'string') {
      this.sendToClient(client, {
        type: 'error',
        id: requestId,
        payload: { message: 'Missing message content' },
      });
      return;
    }

    // Handle commands
    if (content.startsWith('/')) {
      await this.handleCommand(client, content, requestId);
      return;
    }

    // Get or create session
    const session = await this.sessions.getOrCreate(client.id, {
      channelType: client.channelType,
      clientId: client.id,
      senderId: client.senderId,
    });

    // Add user message
    await this.sessions.addMessage(session.id, 'user', content);

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
    const contextMessages = this.sessions.getContextMessages(session.id);
    const chatMessages = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Build enriched prompt with modes and memories
      let enrichedPrompt = this.systemPrompt;
      let memorySection: string | null = null;
      if (this.memoryRetriever && this.memoryStore) {
        const memories = await this.memoryStore.getAll();
        memorySection = this.memoryRetriever.retrieve(memories, content);
      }

      if (this.promptAssembler && this.config.modes?.enabled !== false) {
        const modeState = this.getSessionModeState(session.id);

        // Security context check — BEFORE mode detection
        if (this.securityFloor) {
          const securityContext = this.securityFloor.detectSecurityContext({ userMessage: content });
          if (securityContext.active) {
            // Suspend current mode and use security floor prompt
            modeState.suspendedMode = modeState.activeMode;
            enrichedPrompt = this.promptAssembler.enrichForSecurityContext(securityContext, this.securityFloor, memorySection);
          } else if (modeState.suspendedMode) {
            // Restore suspended mode
            modeState.activeMode = modeState.suspendedMode;
            delete modeState.suspendedMode;
            enrichedPrompt = this.promptAssembler.enrichForMessage(modeState, memorySection, this.userPreferences);
          } else {
            // Normal mode detection
            enrichedPrompt = this.buildModeEnrichedPrompt(content, modeState, memorySection);
          }
        } else {
          // No security floor — normal mode detection
          enrichedPrompt = this.buildModeEnrichedPrompt(content, modeState, memorySection);
        }
      } else if (memorySection) {
        enrichedPrompt = this.systemPrompt + memorySection;
      }

      // Route to best model for this message
      let provider;
      let routingResult: RoutingResult | undefined;

      if (providerOverride || modelOverride) {
        // Manual override — skip router
        provider = this.providers.getProvider(providerOverride || this.config.provider.primary);
      } else if (this.modelRouter && this.config.routing?.enabled !== false) {
        try {
          routingResult = this.modelRouter.route(content, { hasImages: false });
          provider = this.providers.getProvider(routingResult.selection.provider);
        } catch {
          provider = this.providers.getPrimaryProvider();
        }
      } else {
        provider = this.providers.getPrimaryProvider();
      }

      // Execute streaming AI call with tool follow-up loop
      const { response: fullResponse, usage } = await this.executeWithTools(
        session.id,
        chatMessages,
        enrichedPrompt,
        provider,
        (type, data) => {
          if (type === 'text') {
            this.sendToClient(client, { type: 'chunk', id: requestId, payload: { content: data } });
          } else if (type === 'thinking') {
            this.sendToClient(client, { type: 'thinking', id: requestId, payload: { content: data } });
          } else if (type === 'tool_use') {
            this.sendToClient(client, { type: 'tool_use', id: requestId, payload: data });
          } else if (type === 'tool_result') {
            this.sendToClient(client, { type: 'tool_result', id: requestId, payload: data });
          }
        },
        { tools },
      );

      // Save assistant message (skip if empty — happens when response is tool-only)
      if (fullResponse) {
        await this.sessions.addMessage(session.id, 'assistant', fullResponse, {
          input: usage.inputTokens,
          output: usage.outputTokens,
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
      if (this.config.memory?.autoExtract !== false && this.memoryStore && fullResponse && content.length > 20) {
        void this.extractAndLearn(content, fullResponse, session.id);
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
        },
      });

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
    options?: { maxToolRounds?: number; tools?: Array<{ name: string; description: string; input_schema: any }> }
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const maxRounds = options?.maxToolRounds ?? 5;
    const tools = options?.tools ?? toolRegistry.toProviderFormat();
    let currentMessages = [...messages];
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    let fullResponse = '';

    for (let round = 0; round < maxRounds; round++) {
      let roundResponse = '';
      let roundUsage = { inputTokens: 0, outputTokens: 0 };
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      for await (const chunk of provider.stream(currentMessages as any, {
        systemPrompt: enrichedPrompt,
        tools: tools.length > 0 ? tools : undefined,
      })) {
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
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error);
        }
      }

      totalUsage.inputTokens += roundUsage.inputTokens;
      totalUsage.outputTokens += roundUsage.outputTokens;
      fullResponse += roundResponse;

      // No tool calls — we're done
      if (toolUses.length === 0) {
        break;
      }

      // Execute tools and collect results
      const context: ExecutionContext = {
        sessionId,
        workingDirectory: getWorkspacePath(),
        timeout: 30000,
      };

      const toolResultParts: string[] = [];
      for (const toolUse of toolUses) {
        try {
          const result = await toolExecutor.execute(toolUse.name, toolUse.input, context);
          onChunk('tool_result', {
            tool: toolUse.name,
            success: result.success,
            output: result.output,
            error: result.error,
          });
          toolResultParts.push(
            `[${toolUse.name}]: ${result.success ? (result.output || 'Success') : `Error: ${result.error}`}`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          onChunk('tool_result', { tool: toolUse.name, success: false, error: errorMessage });
          toolResultParts.push(`[${toolUse.name}]: Error: ${errorMessage}`);
        }
      }

      // Feed tool results back to AI for synthesis
      const toolResultsMessage = `[Tool Results]\n${toolResultParts.join('\n')}`;
      await this.sessions.addMessage(sessionId, 'user', toolResultsMessage);

      // Rebuild messages with tool results for next round
      const contextMessages = this.sessions.getContextMessages(sessionId);
      currentMessages = contextMessages.map((m) => ({ role: m.role, content: m.content }));
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

        const contextMessages = this.sessions.getContextMessages(session.id);
        const chatMessages = contextMessages.map((m) => ({
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
        const { response: voiceResponse, usage: voiceUsage } = await this.executeWithTools(
          session.id,
          chatMessages,
          voicePrompt,
          provider,
          (_type, _data) => {
            // Voice: don't stream chunks to client — we synthesize the final text
          },
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

  private async handleChannelMessage(inbound: InboundMessage): Promise<void> {
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

    // Add user message
    await this.sessions.addMessage(session.id, 'user', inbound.content);

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

    // Get context messages
    const contextMessages = this.sessions.getContextMessages(session.id);
    const chatMessages = contextMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Show typing indicator while generating response
    const stopTyping = this.channels
      ? await this.channels.startTyping(inbound.channelType, inbound.channelId)
      : () => {};

    try {
      // Get tool definitions from registry
      const tools = toolRegistry.toProviderFormat();

      // Build enriched prompt with modes and memories
      let enrichedPrompt = this.systemPrompt;
      let channelMemorySection: string | null = null;
      if (this.memoryRetriever && this.memoryStore) {
        const memories = await this.memoryStore.getAll();
        channelMemorySection = this.memoryRetriever.retrieve(memories, inbound.content);
      }

      if (this.promptAssembler && this.config.modes?.enabled !== false) {
        const modeState = this.getSessionModeState(session.id);

        // Security context check — BEFORE mode detection
        if (this.securityFloor) {
          const securityContext = this.securityFloor.detectSecurityContext({ userMessage: inbound.content });
          if (securityContext.active) {
            modeState.suspendedMode = modeState.activeMode;
            enrichedPrompt = this.promptAssembler.enrichForSecurityContext(securityContext, this.securityFloor, channelMemorySection);
          } else if (modeState.suspendedMode) {
            modeState.activeMode = modeState.suspendedMode;
            delete modeState.suspendedMode;
            enrichedPrompt = this.buildModeEnrichedPrompt(inbound.content, modeState, channelMemorySection);
          } else {
            enrichedPrompt = this.buildModeEnrichedPrompt(inbound.content, modeState, channelMemorySection);
          }
        } else {
          enrichedPrompt = this.buildModeEnrichedPrompt(inbound.content, modeState, channelMemorySection);
        }
      } else if (channelMemorySection) {
        enrichedPrompt = this.systemPrompt + channelMemorySection;
      }

      // Use executeWithTools for channels — collect final text for channel reply
      const provider = this.providers.getPrimaryProvider();
      const { response: channelResponse, usage: channelUsage } = await this.executeWithTools(
        session.id,
        chatMessages,
        enrichedPrompt,
        provider,
        (_type, _data) => {
          // Channels: don't stream individual chunks — send complete response at end
        },
        { tools },
      );

      stopTyping();

      // Save assistant message
      await this.sessions.addMessage(session.id, 'assistant', channelResponse, {
        input: channelUsage.inputTokens,
        output: channelUsage.outputTokens,
      });

      // Extract memories and learn from conversation (if auto-extract enabled)
      if (this.config.memory?.autoExtract !== false && this.memoryStore && channelResponse && inbound.content.length > 20) {
        void this.extractAndLearn(inbound.content, channelResponse, session.id);
      }

      // Send response
      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: channelResponse,
          replyToId: inbound.id,
        });
      }

      audit('message.sent', {
        channelType: inbound.channelType,
        sessionId: session.id,
        inputTokens: channelUsage.inputTokens,
        outputTokens: channelUsage.outputTokens,
      });
    } catch (error) {
      stopTyping();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      audit('channel.error', { sessionId: session.id, error: errorMessage });

      if (this.channels) {
        await this.channels.send(inbound.channelType, inbound.channelId, {
          content: `Error: ${errorMessage}`,
          replyToId: inbound.id,
        });
      }
    }
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

      console.log(`Registered ${connector.actions.length} tools for connector: ${connector.name}`);
    }
  }

  private async extractAndLearn(userMessage: string, assistantResponse: string, sessionId: string): Promise<void> {
    try {
      const recentMessages = this.sessions.getContextMessages(sessionId);

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
      console.warn('Memory extraction failed:', error instanceof Error ? error.message : error);
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
          console.log(`Connected channels: ${connected.join(', ')}`);
        }
      } catch (error) {
        console.warn('Some channels failed to connect:', error);
      }
    }

    this.running = true;

    console.log(`\n${this.getAgentName()} is ready!`);
    console.log(`Open http://${this.config.gateway.host}:${this.config.gateway.port} in your browser\n`);
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
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval);
      this.memoryCleanupInterval = undefined;
    }
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

export async function startAuxiora(options: AuxioraOptions = {}): Promise<Auxiora> {
  const auxiora = new Auxiora();
  await auxiora.initialize(options);
  await auxiora.start();
  return auxiora;
}
