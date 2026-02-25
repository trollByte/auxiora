/**
 * Configuration validation with detailed error messages
 */

import { type Config } from './index.js';
import type { ZodError } from 'zod';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  value?: any;
  suggestion?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion: string;
}

/**
 * Validate configuration and provide helpful error messages
 */
export function validateConfig(config: Config): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate gateway configuration
  if (config.gateway.host === '0.0.0.0' && config.auth.mode === 'none') {
    warnings.push({
      path: 'gateway.host',
      message: 'Gateway bound to 0.0.0.0 with no authentication',
      suggestion: 'Consider binding to 127.0.0.1 or enabling JWT authentication for security',
    });
  }

  if (config.gateway.port < 1024) {
    warnings.push({
      path: 'gateway.port',
      message: `Port ${config.gateway.port} requires elevated privileges`,
      suggestion: 'Use a port >= 1024 to avoid needing root/admin access',
    });
  }

  // Validate authentication configuration
  if (config.auth.mode === 'jwt') {
    if (!config.auth.jwtSecret) {
      errors.push({
        path: 'auth.jwtSecret',
        message: 'JWT secret required when auth mode is "jwt"',
        suggestion: 'Generate a secret: openssl rand -hex 32',
      });
    } else if (config.auth.jwtSecret.length < 32) {
      warnings.push({
        path: 'auth.jwtSecret',
        message: 'JWT secret should be at least 32 characters',
        suggestion: 'Use a longer secret for better security: openssl rand -hex 32',
      });
    }
  }

  if (config.auth.mode === 'password' && !config.auth.passwordHash) {
    errors.push({
      path: 'auth.passwordHash',
      message: 'Password hash required when auth mode is "password"',
      suggestion: 'Set a password using the CLI: auxiora auth set-password',
    });
  }

  // Validate rate limiting
  if (!config.rateLimit.enabled) {
    warnings.push({
      path: 'rateLimit.enabled',
      message: 'Rate limiting is disabled',
      suggestion: 'Enable rate limiting to prevent abuse',
    });
  }

  if (config.rateLimit.maxRequests > 1000) {
    warnings.push({
      path: 'rateLimit.maxRequests',
      message: `High rate limit (${config.rateLimit.maxRequests} requests)`,
      suggestion: 'Consider a lower limit to prevent API quota exhaustion',
    });
  }

  // Validate provider configuration
  if (config.provider.primary === config.provider.fallback) {
    warnings.push({
      path: 'provider.fallback',
      message: 'Fallback provider same as primary',
      suggestion: 'Use a different provider for fallback or remove fallback',
    });
  }

  // Validate session configuration
  if (config.session.maxContextTokens > 200000) {
    warnings.push({
      path: 'session.maxContextTokens',
      message: 'Very large context window may cause performance issues',
      suggestion: 'Consider reducing to 100000 tokens for better performance',
    });
  }

  if (config.session.ttlMinutes < 60) {
    warnings.push({
      path: 'session.ttlMinutes',
      message: 'Short session TTL may cause frequent session loss',
      suggestion: 'Consider at least 60 minutes for better user experience',
    });
  }

  // Validate channel configuration
  const enabledChannels = Object.entries(config.channels)
    .filter(([_, channelConfig]) => channelConfig.enabled)
    .map(([name]) => name);

  if (enabledChannels.length === 0) {
    warnings.push({
      path: 'channels',
      message: 'No channels enabled',
      suggestion: 'Enable at least webchat for testing',
    });
  }

  // Validate logging configuration
  if (config.logging.maxFileSizeMb > 100) {
    warnings.push({
      path: 'logging.maxFileSizeMb',
      message: 'Large log file size may consume significant disk space',
      suggestion: 'Consider a smaller size with log rotation',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('❌ Configuration Errors:\n');
    for (const error of result.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`    💡 ${error.suggestion}`);
      }
      lines.push('');
    }
  }

  if (result.warnings.length > 0) {
    lines.push('⚠️  Configuration Warnings:\n');
    for (const warning of result.warnings) {
      lines.push(`  ${warning.path}: ${warning.message}`);
      lines.push(`    💡 ${warning.suggestion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format Zod validation errors
 */
export function formatZodError(error: ZodError): string {
  const lines: string[] = ['❌ Configuration Validation Failed:\n'];

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    lines.push(`  ${path || 'config'}: ${issue.message}`);

    // Add helpful suggestions based on error type
    if (issue.code === 'invalid_type') {
      lines.push(`    💡 Expected ${issue.expected}, got ${issue.received}`);
    } else if (issue.code === 'invalid_enum_value') {
      lines.push(`    💡 Valid options: ${issue.options.join(', ')}`);
    } else if (issue.code === 'too_small') {
      lines.push(`    💡 Minimum value: ${issue.minimum}`);
    } else if (issue.code === 'too_big') {
      lines.push(`    💡 Maximum value: ${issue.maximum}`);
    }

    lines.push('');
  }

  lines.push('See .env.example for configuration reference');

  return lines.join('\n');
}

/**
 * Validate and report configuration issues
 */
export function validateAndReport(config: Config): boolean {
  const result = validateConfig(config);

  if (!result.valid || result.warnings.length > 0) {
    console.error(formatValidationErrors(result));
  }

  if (!result.valid) {
    console.error('\n⛔ Cannot start with invalid configuration\n');
    return false;
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Starting with warnings (see above)\n');
  }

  return true;
}
