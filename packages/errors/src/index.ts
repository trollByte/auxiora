/**
 * Centralized error handling for Auxiora
 *
 * Provides:
 * - Standardized error codes
 * - User-friendly error messages
 * - Retry logic helpers
 * - Error serialization
 */

export enum ErrorCode {
  // Vault errors (1xxx)
  VAULT_LOCKED = 'E1001',
  VAULT_INVALID_PASSWORD = 'E1002',
  VAULT_NOT_INITIALIZED = 'E1003',
  VAULT_CREDENTIAL_NOT_FOUND = 'E1004',
  VAULT_ENCRYPTION_FAILED = 'E1005',
  VAULT_DECRYPTION_FAILED = 'E1006',

  // Gateway errors (2xxx)
  GATEWAY_BIND_FAILED = 'E2001',
  GATEWAY_RATE_LIMIT_EXCEEDED = 'E2002',
  GATEWAY_UNAUTHORIZED = 'E2003',
  GATEWAY_INVALID_TOKEN = 'E2004',
  GATEWAY_CONNECTION_FAILED = 'E2005',

  // Provider errors (3xxx)
  PROVIDER_API_KEY_MISSING = 'E3001',
  PROVIDER_API_ERROR = 'E3002',
  PROVIDER_RATE_LIMITED = 'E3003',
  PROVIDER_TIMEOUT = 'E3004',
  PROVIDER_INVALID_RESPONSE = 'E3005',
  PROVIDER_QUOTA_EXCEEDED = 'E3006',

  // Channel errors (4xxx)
  CHANNEL_CONNECTION_FAILED = 'E4001',
  CHANNEL_AUTHENTICATION_FAILED = 'E4002',
  CHANNEL_MESSAGE_SEND_FAILED = 'E4003',
  CHANNEL_INVALID_TOKEN = 'E4004',
  CHANNEL_RATE_LIMITED = 'E4005',

  // Session errors (5xxx)
  SESSION_NOT_FOUND = 'E5001',
  SESSION_EXPIRED = 'E5002',
  SESSION_STORAGE_FAILED = 'E5003',
  SESSION_INVALID_STATE = 'E5004',

  // Configuration errors (6xxx)
  CONFIG_INVALID = 'E6001',
  CONFIG_MISSING_REQUIRED = 'E6002',
  CONFIG_TYPE_MISMATCH = 'E6003',
  CONFIG_VALIDATION_FAILED = 'E6004',

  // Audit errors (7xxx)
  AUDIT_WRITE_FAILED = 'E7001',
  AUDIT_CHAIN_BROKEN = 'E7002',
  AUDIT_INVALID_FORMAT = 'E7003',

  // Daemon errors (8xxx)
  DAEMON_INSTALL_FAILED = 'E8001',
  DAEMON_START_FAILED = 'E8002',
  DAEMON_STOP_FAILED = 'E8003',
  DAEMON_NOT_INSTALLED = 'E8004',
  DAEMON_PERMISSION_DENIED = 'E8005',

  // Generic errors (9xxx)
  UNKNOWN_ERROR = 'E9000',
  INTERNAL_ERROR = 'E9001',
  INVALID_INPUT = 'E9002',
  NOT_IMPLEMENTED = 'E9003',
  PERMISSION_DENIED = 'E9004',
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  userMessage?: string;
  retryable: boolean;
  context?: Record<string, any>;
  cause?: Error;
}

/**
 * Base error class for all Auxiora errors
 */
export class AuxioraError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly context: Record<string, any>;
  public readonly timestamp: Date;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = this.constructor.name;
    this.code = details.code;
    this.userMessage = details.userMessage || details.message;
    this.retryable = details.retryable;
    this.context = details.context || {};
    this.timestamp = new Date();

    if (details.cause) {
      this.cause = details.cause;
    }

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  toUserResponse() {
    return {
      error: {
        code: this.code,
        message: this.userMessage,
        retryable: this.retryable,
      },
    };
  }
}

/**
 * Vault-related errors
 */
export class VaultError extends AuxioraError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>, cause?: Error) {
    super({
      code,
      message,
      userMessage: VaultError.getUserMessage(code),
      retryable: VaultError.isRetryable(code),
      context,
      cause,
    });
  }

  private static getUserMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.VAULT_LOCKED:
        return 'Vault is locked. Please unlock with your password.';
      case ErrorCode.VAULT_INVALID_PASSWORD:
        return 'Invalid vault password. Please try again.';
      case ErrorCode.VAULT_NOT_INITIALIZED:
        return 'Vault not initialized. Run: auxiora vault init';
      case ErrorCode.VAULT_CREDENTIAL_NOT_FOUND:
        return 'Credential not found in vault.';
      case ErrorCode.VAULT_ENCRYPTION_FAILED:
        return 'Failed to encrypt credential. Please check system resources.';
      case ErrorCode.VAULT_DECRYPTION_FAILED:
        return 'Failed to decrypt credential. Vault may be corrupted.';
      default:
        return 'Vault operation failed.';
    }
  }

  private static isRetryable(code: ErrorCode): boolean {
    return [
      ErrorCode.VAULT_ENCRYPTION_FAILED,
      ErrorCode.VAULT_DECRYPTION_FAILED,
    ].includes(code);
  }
}

/**
 * Gateway-related errors
 */
export class GatewayError extends AuxioraError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>, cause?: Error) {
    super({
      code,
      message,
      userMessage: GatewayError.getUserMessage(code),
      retryable: GatewayError.isRetryable(code),
      context,
      cause,
    });
  }

  private static getUserMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.GATEWAY_BIND_FAILED:
        return 'Failed to start gateway. Port may already be in use.';
      case ErrorCode.GATEWAY_RATE_LIMIT_EXCEEDED:
        return 'Rate limit exceeded. Please slow down and try again later.';
      case ErrorCode.GATEWAY_UNAUTHORIZED:
        return 'Unauthorized. Please authenticate first.';
      case ErrorCode.GATEWAY_INVALID_TOKEN:
        return 'Invalid or expired authentication token.';
      case ErrorCode.GATEWAY_CONNECTION_FAILED:
        return 'Connection failed. Please check network connectivity.';
      default:
        return 'Gateway error occurred.';
    }
  }

  private static isRetryable(code: ErrorCode): boolean {
    return [
      ErrorCode.GATEWAY_CONNECTION_FAILED,
      ErrorCode.GATEWAY_RATE_LIMIT_EXCEEDED,
    ].includes(code);
  }
}

/**
 * Provider-related errors
 */
export class ProviderError extends AuxioraError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>, cause?: Error) {
    super({
      code,
      message,
      userMessage: ProviderError.getUserMessage(code),
      retryable: ProviderError.isRetryable(code),
      context,
      cause,
    });
  }

  private static getUserMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.PROVIDER_API_KEY_MISSING:
        return 'AI provider API key not configured. Add with: auxiora vault add ANTHROPIC_API_KEY';
      case ErrorCode.PROVIDER_API_ERROR:
        return 'AI provider API error. Please try again.';
      case ErrorCode.PROVIDER_RATE_LIMITED:
        return 'AI provider rate limit reached. Please wait a moment.';
      case ErrorCode.PROVIDER_TIMEOUT:
        return 'AI provider request timed out. Please try again.';
      case ErrorCode.PROVIDER_INVALID_RESPONSE:
        return 'Received invalid response from AI provider.';
      case ErrorCode.PROVIDER_QUOTA_EXCEEDED:
        return 'AI provider quota exceeded. Check your account limits.';
      default:
        return 'AI provider error occurred.';
    }
  }

  private static isRetryable(code: ErrorCode): boolean {
    return [
      ErrorCode.PROVIDER_API_ERROR,
      ErrorCode.PROVIDER_RATE_LIMITED,
      ErrorCode.PROVIDER_TIMEOUT,
    ].includes(code);
  }
}

/**
 * Channel-related errors
 */
export class ChannelError extends AuxioraError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>, cause?: Error) {
    super({
      code,
      message,
      userMessage: ChannelError.getUserMessage(code),
      retryable: ChannelError.isRetryable(code),
      context,
      cause,
    });
  }

  private static getUserMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.CHANNEL_CONNECTION_FAILED:
        return 'Failed to connect to messaging platform. Check credentials.';
      case ErrorCode.CHANNEL_AUTHENTICATION_FAILED:
        return 'Channel authentication failed. Verify bot token.';
      case ErrorCode.CHANNEL_MESSAGE_SEND_FAILED:
        return 'Failed to send message. Please try again.';
      case ErrorCode.CHANNEL_INVALID_TOKEN:
        return 'Invalid channel token. Update credentials.';
      case ErrorCode.CHANNEL_RATE_LIMITED:
        return 'Channel rate limit reached. Slowing down...';
      default:
        return 'Channel error occurred.';
    }
  }

  private static isRetryable(code: ErrorCode): boolean {
    return [
      ErrorCode.CHANNEL_CONNECTION_FAILED,
      ErrorCode.CHANNEL_MESSAGE_SEND_FAILED,
      ErrorCode.CHANNEL_RATE_LIMITED,
    ].includes(code);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends AuxioraError {
  constructor(code: ErrorCode, message: string, context?: Record<string, any>, cause?: Error) {
    super({
      code,
      message,
      userMessage: ConfigError.getUserMessage(code),
      retryable: false,
      context,
      cause,
    });
  }

  private static getUserMessage(code: ErrorCode): string {
    switch (code) {
      case ErrorCode.CONFIG_INVALID:
        return 'Invalid configuration. Please check your config file.';
      case ErrorCode.CONFIG_MISSING_REQUIRED:
        return 'Required configuration missing.';
      case ErrorCode.CONFIG_TYPE_MISMATCH:
        return 'Configuration type mismatch. Check expected types.';
      case ErrorCode.CONFIG_VALIDATION_FAILED:
        return 'Configuration validation failed.';
      default:
        return 'Configuration error occurred.';
    }
  }
}

/**
 * Retry logic helper
 */
export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    delayMs,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: Error;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (error instanceof AuxioraError && !error.retryable) {
        throw error;
      }

      // Last attempt - don't retry
      if (attempt === maxAttempts) {
        throw error;
      }

      // Call onRetry callback
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, currentDelay));

      // Increase delay for next attempt (exponential backoff)
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError!;
}

/**
 * Error type guards
 */
export function isAuxioraError(error: unknown): error is AuxioraError {
  return error instanceof AuxioraError;
}

export function isVaultError(error: unknown): error is VaultError {
  return error instanceof VaultError;
}

export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function isChannelError(error: unknown): error is ChannelError {
  return error instanceof ChannelError;
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}

/**
 * Error wrapping helper
 */
export function wrapError(error: unknown, fallbackMessage: string): AuxioraError {
  if (error instanceof AuxioraError) {
    return error;
  }

  if (error instanceof Error) {
    return new AuxioraError({
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
      userMessage: fallbackMessage,
      retryable: false,
      cause: error,
    });
  }

  return new AuxioraError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: String(error),
    userMessage: fallbackMessage,
    retryable: false,
  });
}
