import { z } from 'zod';
import { scanAllStringFields } from './scanner.js';
import type { ScanResult } from './scanner.js';

export const PersonalityConfigSchema = z
  .object({
    name: z
      .string()
      .max(64)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    author: z.string().max(128),
    description: z.string().max(512).optional(),
    license: z
      .enum(['MIT', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0', 'proprietary'])
      .optional(),
    tone: z
      .object({
        warmth: z.number().min(0).max(1).optional(),
        directness: z.number().min(0).max(1).optional(),
        humor: z.number().min(0).max(1).optional(),
        formality: z.number().min(0).max(1).optional(),
      })
      .optional(),
    errorStyle: z
      .enum([
        'professional',
        'apologetic',
        'matter_of_fact',
        'self_deprecating',
        'gentle',
        'detailed',
        'encouraging',
        'terse',
        'educational',
      ])
      .optional(),
    catchphrases: z
      .object({
        greeting: z.string().max(256).optional(),
        farewell: z.string().max(256).optional(),
        thinking: z.string().max(256).optional(),
        success: z.string().max(256).optional(),
        error: z.string().max(256).optional(),
      })
      .optional(),
    expertise: z.array(z.string().max(64)).max(20).optional(),
    boundaries: z
      .object({
        neverJokeAbout: z.array(z.string().max(64)).max(20).optional(),
        neverAdviseOn: z.array(z.string().max(64)).max(20).optional(),
      })
      .optional(),
    bodyMarkdown: z.string().max(4096).optional(),
    voiceProfile: z
      .object({
        voice: z
          .enum(['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'])
          .optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        pauseDuration: z.number().int().min(100).max(1000).optional(),
        useFillers: z.boolean().optional(),
        fillerFrequency: z.number().min(0).max(0.5).optional(),
      })
      .optional(),
  })
  .strict();

export const FORBIDDEN_FIELD_NAMES: readonly string[] = [
  'corePrinciples',
  'securityFloor',
  'confirmationPatterns',
  'auditBehavior',
  'systemPrompt',
  'modes',
  'preferences',
];

export const FORBIDDEN_FIELD_PATTERNS: readonly RegExp[] = [
  /prompt/i,
  /system/i,
  /instruction/i,
  /override/i,
  /ignore/i,
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePersonalityConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ['Input must be a non-null object'], warnings };
  }

  const obj = raw as Record<string, unknown>;

  // Check forbidden field names
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_FIELD_NAMES.includes(key)) {
      errors.push(`Forbidden field name: "${key}"`);
    }
  }

  // Check forbidden field name patterns
  for (const key of Object.keys(obj)) {
    for (const pattern of FORBIDDEN_FIELD_PATTERNS) {
      if (pattern.test(key)) {
        errors.push(`Field name "${key}" matches forbidden pattern: ${pattern}`);
        break;
      }
    }
  }

  // Parse with Zod schema
  const result = PersonalityConfigSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  // Content scan (only if schema passed)
  if (result.success) {
    const scanResult: ScanResult = scanAllStringFields(obj);
    if (!scanResult.clean) {
      for (const violation of scanResult.violations) {
        errors.push(
          `Content violation in "${violation.field}": matched pattern "${violation.pattern}"`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
