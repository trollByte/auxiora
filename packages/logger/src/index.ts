/**
 * Structured logging for Auxiora
 *
 * Features:
 * - Structured JSON logs (production)
 * - Pretty-printed logs (development)
 * - Log levels (debug, info, warn, error)
 * - Request ID tracking
 * - Automatic log rotation
 * - Performance-optimized (pino)
 */

import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';
import { getLogDir } from '@auxiora/core';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  destination?: string;
  requestId?: string;
}

export interface LogContext {
  [key: string]: any;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  channelType?: string;
  error?: Error;
}

/**
 * Create a logger instance
 */
export function createLogger(name: string, config: LoggerConfig = {}): Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const level = config.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
  const pretty = config.pretty ?? isDevelopment;

  const options: LoggerOptions = {
    name,
    level,
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  };

  // Pretty printing for development
  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        destination: 2, // stderr — keep stdout clean for interactive prompts
      },
    };
  }

  // Log to file in production
  if (config.destination) {
    const logPath = path.join(getLogDir(), config.destination);
    const logDir = path.dirname(logPath);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    options.transport = {
      target: 'pino/file',
      options: {
        destination: logPath,
        mkdir: true,
      },
    };
  }

  // When a transport is configured (pretty or file), it handles its own destination.
  // Otherwise, write to stderr (convention: stdout for data, stderr for diagnostics).
  const pinoLogger = options.transport
    ? pino(options)
    : pino(options, pino.destination(2));

  return new Logger(pinoLogger, config.requestId);
}

/**
 * Wrapper around pino logger with Auxiora-specific features
 */
export class Logger {
  private requestId?: string;

  constructor(
    private logger: PinoLogger,
    requestId?: string
  ) {
    this.requestId = requestId;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = this.logger.child(this.sanitizeContext(context));
    return new Logger(childLogger, context.requestId || this.requestId);
  }

  /**
   * Trace level logging (most verbose)
   */
  trace(message: string, context?: LogContext): void {
    this.logger.trace(this.enrichContext(context), message);
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.enrichContext(context), message);
  }

  /**
   * Info level logging (default)
   */
  info(message: string, context?: LogContext): void {
    this.logger.info(this.enrichContext(context), message);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.enrichContext(context), message);
  }

  /**
   * Error level logging
   */
  error(message: string, context?: LogContext): void {
    this.logger.error(this.enrichContext(context), message);
  }

  /**
   * Fatal level logging (highest severity)
   */
  fatal(message: string, context?: LogContext): void {
    this.logger.fatal(this.enrichContext(context), message);
  }

  /**
   * Log with custom level
   */
  log(level: LogLevel, message: string, context?: LogContext): void {
    this.logger[level](this.enrichContext(context), message);
  }

  /**
   * Measure execution time of a function
   */
  async time<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = performance.now();
    const enrichedContext = this.enrichContext(context);

    this.logger.debug(enrichedContext, `Starting: ${label}`);

    try {
      const result = await fn();
      const duration = performance.now() - start;

      this.logger.info(
        { ...enrichedContext, durationMs: duration.toFixed(2) },
        `Completed: ${label}`
      );

      return result;
    } catch (error) {
      const duration = performance.now() - start;

      this.logger.error(
        { ...enrichedContext, durationMs: duration.toFixed(2), error },
        `Failed: ${label}`
      );

      throw error;
    }
  }

  /**
   * Flush logs (useful before process exit)
   */
  async flush(): Promise<void> {
    await this.logger.flush();
  }

  /**
   * Get the underlying pino logger
   */
  getPinoLogger(): PinoLogger {
    return this.logger;
  }

  /**
   * Enrich context with request ID
   */
  private enrichContext(context?: LogContext): LogContext {
    if (!context && !this.requestId) {
      return {};
    }

    const enriched = { ...context };

    if (this.requestId && !enriched.requestId) {
      enriched.requestId = this.requestId;
    }

    return this.sanitizeContext(enriched);
  }

  /**
   * Sanitize context to prevent logging sensitive data
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'apikey',
      'authorization',
      'auth',
      'credentials',
      'credential',
    ];

    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      // Redact sensitive keys
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Handle Error objects specially
      if (value instanceof Error) {
        sanitized[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  }
}

/**
 * Global logger instances
 */
const loggers = new Map<string, Logger>();

/**
 * Get or create a logger for a specific component
 */
export function getLogger(name: string, config?: LoggerConfig): Logger {
  const key = `${name}:${config?.requestId || 'default'}`;

  if (!loggers.has(key)) {
    loggers.set(key, createLogger(name, config));
  }

  return loggers.get(key)!;
}

/**
 * Request ID generation helper
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Correlation ID middleware helper
 */
export function withRequestId<T>(
  fn: (logger: Logger) => Promise<T>,
  loggerName: string
): Promise<T> {
  const requestId = generateRequestId();
  const logger = getLogger(loggerName, { requestId });
  return fn(logger);
}

// Export default logger for convenience
export const logger = getLogger('auxiora');
