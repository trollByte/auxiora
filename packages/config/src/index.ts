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
  maxRequests: z.number().int().positive().default(60),
});

const PairingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  codeLength: z.number().int().min(4).max(12).default(6),
  expiryMinutes: z.number().int().positive().default(15),
});

const ProviderConfigSchema = z.object({
  primary: z.enum(['anthropic', 'openai']).default('anthropic'),
  fallback: z.enum(['anthropic', 'openai']).optional(),
  anthropic: z.object({
    model: z.string().default('claude-sonnet-4-20250514'),
    maxTokens: z.number().int().positive().default(4096),
  }).default({}),
  openai: z.object({
    model: z.string().default('gpt-4o'),
    maxTokens: z.number().int().positive().default(4096),
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
});

export const ConfigSchema = z.object({
  gateway: GatewayConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  rateLimit: RateLimitConfigSchema.default({}),
  pairing: PairingConfigSchema.default({}),
  provider: ProviderConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  channels: ChannelConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

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
