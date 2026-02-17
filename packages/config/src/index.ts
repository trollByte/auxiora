import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { getConfigPath, isWindows } from '@auxiora/core';

const GatewayConfigSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(18800),
  corsOrigins: z.array(z.string()).default(['http://localhost:18800']),
});

const AuthConfigSchema = z.object({
  mode: z.enum(['none', 'password', 'jwt']).default('none'),
  /** Argon2id hash of the gateway password */
  passwordHash: z.string().optional(),
  /** Secret for signing JWT tokens (min 32 chars recommended) */
  jwtSecret: z.string().optional(),
  jwtExpiresIn: z.string().default('7d'),
  refreshExpiresIn: z.string().default('30d'),
});

const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(true),
  windowMs: z.number().int().positive().default(60000), // 1 minute
  maxRequests: z.number().int().positive().default(300),
});

const PairingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  codeLength: z.number().int().min(4).max(12).default(6),
  expiryMinutes: z.number().int().positive().default(15),
  autoApproveChannels: z.array(z.string()).default(['webchat']),
  persistPath: z.string().optional(),
});

const ModelRoutingSchema = z.object({
  enabled: z.boolean().default(true),
  defaultModel: z.string().optional(),
  rules: z.array(z.object({
    task: z.enum(['reasoning', 'code', 'creative', 'vision', 'long-context', 'fast', 'private', 'image-gen']),
    provider: z.string(),
    model: z.string(),
    priority: z.number().default(0),
  })).default([]),
  costLimits: z.object({
    dailyBudget: z.number().positive().optional(),
    monthlyBudget: z.number().positive().optional(),
    perMessageMax: z.number().positive().optional(),
    warnAt: z.number().min(0).max(1).default(0.8),
  }).default({}),
  preferences: z.object({
    preferLocal: z.boolean().default(false),
    preferCheap: z.boolean().default(false),
    sensitiveToLocal: z.boolean().default(false),
  }).default({}),
});

const ProviderConfigSchema = z.object({
  primary: z.string().default('anthropic'),
  fallback: z.string().optional(),
  anthropic: z.object({
    model: z.string().default('claude-sonnet-4-20250514'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  openai: z.object({
    model: z.string().default('gpt-5.2'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  google: z.object({
    model: z.string().default('gemini-2.5-flash'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  ollama: z.object({
    model: z.string().default('llama3'),
    maxTokens: z.number().int().positive().default(16384),
    baseUrl: z.string().default('http://localhost:11434'),
  }).default({}),
  openaiCompatible: z.object({
    model: z.string().default(''),
    maxTokens: z.number().int().positive().default(16384),
    baseUrl: z.string().default(''),
    name: z.string().default('custom'),
  }).default({}),
  groq: z.object({
    model: z.string().default('llama-3.3-70b-versatile'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  deepseek: z.object({
    model: z.string().default('deepseek-chat'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  cohere: z.object({
    model: z.string().default('command-r-plus'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  xai: z.object({
    model: z.string().default('grok-2'),
    maxTokens: z.number().int().positive().default(16384),
  }).default({}),
  replicate: z.object({
    model: z.string().default('meta/meta-llama-3-70b-instruct'),
  }).default({}),
});

const SessionConfigSchema = z.object({
  maxContextTokens: z.number().int().positive().default(100000),
  ttlMinutes: z.number().int().positive().default(1440), // 24 hours
  autoSave: z.boolean().default(true),
  compactionEnabled: z.boolean().default(true),
});

const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  auditEnabled: z.boolean().default(true),
  maxFileSizeMb: z.number().positive().default(10),
  maxFiles: z.number().int().positive().default(5),
});

const ChannelConfigSchema = z.object({
  discord: z.object({
    enabled: z.boolean().default(false),
    mentionOnly: z.boolean().default(true),
  }).default({}),
  telegram: z.object({
    enabled: z.boolean().default(false),
    webhookMode: z.boolean().default(false),
  }).default({}),
  slack: z.object({
    enabled: z.boolean().default(false),
    socketMode: z.boolean().default(true),
  }).default({}),
  twilio: z.object({
    enabled: z.boolean().default(false),
    smsEnabled: z.boolean().default(true),
    whatsappEnabled: z.boolean().default(false),
  }).default({}),
  webchat: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
  matrix: z.object({
    enabled: z.boolean().default(false),
    autoJoinRooms: z.boolean().default(true),
  }).default({}),
  signal: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
  email: z.object({
    enabled: z.boolean().default(false),
    pollInterval: z.number().int().positive().default(30000),
  }).default({}),
  teams: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
  whatsapp: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
});

const VoiceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  sttProvider: z.enum(['openai-whisper']).default('openai-whisper'),
  ttsProvider: z.enum(['openai-tts']).default('openai-tts'),
  defaultVoice: z.string().default('alloy'),
  language: z.string().default('en'),
  maxAudioDuration: z.number().int().positive().default(30),
  sampleRate: z.number().int().positive().default(16000),
});

const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(false),
  basePath: z.string().default('/api/v1/webhooks'),
  signatureHeader: z.string().default('x-webhook-signature'),
  maxPayloadSize: z.number().int().positive().default(65536),
});

const DashboardConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sessionTtlMs: z.number().int().positive().default(86_400_000),
});

// [P6] Desktop config
export const DesktopConfigSchema = z.object({
  autoStart: z.boolean().default(false),
  minimizeToTray: z.boolean().default(true),
  hotkey: z.string().default('CommandOrControl+Shift+A'),
  notificationsEnabled: z.boolean().default(true),
  updateChannel: z.enum(['stable', 'beta', 'nightly']).default('stable'),
  ollamaEnabled: z.boolean().default(false),
  ollamaPort: z.number().int().min(1).max(65535).default(11434),
  windowWidth: z.number().int().positive().default(1024),
  windowHeight: z.number().int().positive().default(768),
});
export type DesktopConfig = z.infer<typeof DesktopConfigSchema>;

// [P7] Cloud config
export const CloudConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseDataDir: z.string().default('/data/tenants'),
  jwtSecret: z.string().default(''),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
  domain: z.string().default('localhost'),
});
export type CloudConfig = z.infer<typeof CloudConfigSchema>;

// [P12] Trust / Autonomy
const TrustConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultLevel: z.number().int().min(0).max(4).default(0),
  autoPromote: z.boolean().default(true),
  promotionThreshold: z.number().int().positive().default(10),
  demotionThreshold: z.number().int().positive().default(3),
  autoPromoteCeiling: z.number().int().min(0).max(4).default(3),
});

const ResearchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  braveApiKey: z.string().optional(),
  defaultDepth: z.enum(['quick', 'standard', 'deep']).default('standard'),
  maxConcurrentSources: z.number().int().positive().default(5),
  searchTimeout: z.number().int().positive().default(10000),
  fetchTimeout: z.number().int().positive().default(15000),
});

const IntentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.3),
});

const PluginsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dir: z.string().optional(),
  marketplace: z.object({
    registryUrl: z.string().default('https://registry.auxiora.dev'),
    autoUpdate: z.boolean().default(false),
  }).default({}),
  pluginConfigs: z.record(z.string(), z.unknown()).default({}),
  approvedPermissions: z.record(z.string(), z.array(z.enum([
    'NETWORK', 'FILESYSTEM', 'SHELL', 'PROVIDER_ACCESS', 'CHANNEL_ACCESS', 'MEMORY_ACCESS',
  ]))).default({}),
});

const MemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoExtract: z.boolean().default(true),
  maxEntries: z.number().int().positive().default(1000),
  encryptAtRest: z.boolean().default(false),
  cleanupIntervalMinutes: z.number().int().positive().default(60),
  adaptivePersonality: z.boolean().default(true),
  patternDetection: z.boolean().default(true),
  relationshipTracking: z.boolean().default(true),
  importanceDecay: z.number().min(0).max(1).default(0.01),
});

const OrchestrationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxConcurrentAgents: z.number().int().min(1).max(10).default(5),
  defaultTimeout: z.number().int().positive().default(60000),
  totalTimeout: z.number().int().positive().default(300000),
  allowedPatterns: z.array(z.enum([
    'parallel', 'sequential', 'debate', 'map-reduce', 'supervisor',
  ])).default(['parallel', 'sequential', 'debate', 'map-reduce', 'supervisor']),
  costMultiplierWarning: z.number().positive().default(3),
});

const UserPreferencesSchema = z.object({
  verbosity: z.number().min(0).max(1).default(0.5),
  formality: z.number().min(0).max(1).default(0.5),
  proactiveness: z.number().min(0).max(1).default(0.5),
  riskTolerance: z.number().min(0).max(1).default(0.5),
  humor: z.number().min(0).max(1).default(0.3),
  feedbackStyle: z.enum(['direct', 'sandwich', 'gentle']).default('direct'),
  expertiseAssumption: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate'),
});

const ModeIdSchema = z.enum([
  'operator', 'analyst', 'advisor', 'writer',
  'socratic', 'legal', 'roast', 'companion',
]);

const ModesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultMode: z.union([ModeIdSchema, z.literal('auto'), z.literal('off')]).default('auto'),
  autoDetection: z.boolean().default(true),
  confirmationThreshold: z.number().min(0).max(1).default(0.4),
  preferences: UserPreferencesSchema.default({}),
});

const AgentIdentitySchema = z.object({
  name: z.string().default('Auxiora'),
  pronouns: z.string().default('they/them'),
  avatar: z.string().optional(),
  vibe: z.string().max(200).optional(),
  customInstructions: z.string().max(4000).optional(),
  personality: z.string().default('professional'),
  tone: z.object({
    warmth: z.number().min(0).max(1).default(0.6),
    directness: z.number().min(0).max(1).default(0.5),
    humor: z.number().min(0).max(1).default(0.3),
    formality: z.number().min(0).max(1).default(0.5),
  }).default({}),
  expertise: z.array(z.string()).default([]),
  errorStyle: z.enum(['apologetic', 'matter_of_fact', 'self_deprecating', 'professional', 'gentle', 'detailed', 'encouraging', 'terse', 'educational']).default('professional'),
  catchphrases: z.object({
    greeting: z.string().optional(),
    farewell: z.string().optional(),
    thinking: z.string().optional(),
    success: z.string().optional(),
    error: z.string().optional(),
  }).default({}),
  boundaries: z.object({
    neverJokeAbout: z.array(z.string()).default([]),
    neverAdviseOn: z.array(z.string()).default([]),
  }).default({}),
});

export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

const SelfAwarenessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenBudget: z.number().default(500),
  collectors: z.object({
    conversationReflector: z.boolean().default(true),
    capacityMonitor: z.boolean().default(true),
    knowledgeBoundary: z.boolean().default(true),
    relationshipModel: z.boolean().default(true),
    temporalTracker: z.boolean().default(true),
    environmentSensor: z.boolean().default(true),
    metaCognitor: z.boolean().default(true),
  }).default({}),
  proactiveInsights: z.boolean().default(true),
}).default({});

export const ConfigSchema = z.object({
  gateway: GatewayConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  rateLimit: RateLimitConfigSchema.default({}),
  pairing: PairingConfigSchema.default({}),
  provider: ProviderConfigSchema.default({}),
  routing: ModelRoutingSchema.default({}),
  session: SessionConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  channels: ChannelConfigSchema.default({}),
  voice: VoiceConfigSchema.default({}),
  webhooks: WebhookConfigSchema.default({}),
  dashboard: DashboardConfigSchema.default({}),
  plugins: PluginsConfigSchema.default({}),
  memory: MemoryConfigSchema.default({}),
  orchestration: OrchestrationConfigSchema.default({}),
  agent: AgentIdentitySchema.default({}),
  modes: ModesConfigSchema.default({}),
  research: ResearchConfigSchema.default({}),
  selfAwareness: SelfAwarenessConfigSchema.default({}),
  // [P12] Trust / Autonomy
  trust: TrustConfigSchema.default({}),
  intent: IntentConfigSchema.default({}),
  // [P6] Desktop
  desktop: DesktopConfigSchema.default({}),
  // [P7] Cloud
  cloud: CloudConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ModelRouting = z.infer<typeof ModelRoutingSchema>;
export type OrchestrationConfig = z.infer<typeof OrchestrationConfigSchema>;
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;
export type TrustConfig = z.infer<typeof TrustConfigSchema>;
export type IntentConfig = z.infer<typeof IntentConfigSchema>;
export type ModesConfig = z.infer<typeof ModesConfigSchema>;

const ENV_PREFIX = 'AUXIORA_';

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

function getEnvValue(path: string[]): string | undefined {
  const envKey = ENV_PREFIX + path.map(camelToSnake).join('_');
  return process.env[envKey];
}

function applyEnvOverrides(config: Record<string, unknown>, path: string[] = []): void {
  for (const [key, value] of Object.entries(config)) {
    const currentPath = [...path, key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      applyEnvOverrides(value as Record<string, unknown>, currentPath);
    } else {
      const envValue = getEnvValue(currentPath);
      if (envValue !== undefined) {
        if (typeof value === 'boolean') {
          config[key] = envValue.toLowerCase() === 'true';
        } else if (typeof value === 'number') {
          config[key] = Number(envValue);
        } else {
          config[key] = envValue;
        }
      }
    }
  }
}

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  let rawConfig: Record<string, unknown> = {};

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    rawConfig = JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, use defaults
  }

  // Apply environment variable overrides
  applyEnvOverrides(rawConfig);

  // Validate and return
  return ConfigSchema.parse(rawConfig);
}

export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  if (!isWindows()) {
    await fs.chmod(configPath, 0o600);
  }
}

export async function getDefaultConfig(): Promise<Config> {
  return ConfigSchema.parse({});
}
