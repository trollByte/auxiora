import * as vm from 'node:vm';
import { getLogger } from '@auxiora/logger';
import type { PluginPermission } from './types.js';

const logger = getLogger('plugins:sandbox');

export interface SandboxOptions {
  permissions: PluginPermission[];
  timeoutMs?: number;
  memoryLimitMb?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MEMORY_LIMIT_MB = 64;

export class PluginSandbox {
  private context: vm.Context | null = null;
  private permissions: Set<PluginPermission>;
  private timeoutMs: number;
  private destroyed = false;

  constructor(options: SandboxOptions) {
    this.permissions = new Set(options.permissions);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  createContext(extraGlobals?: Record<string, unknown>): vm.Context {
    if (this.destroyed) {
      throw new Error('Sandbox has been destroyed');
    }

    const sandbox: Record<string, unknown> = {
      console: this.createSafeConsole(),
      setTimeout: this.permissions.has('SHELL') ? setTimeout : undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout,
      clearInterval,
      Promise,
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Symbol,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      URIError,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      AbortController,
      AbortSignal,
      crypto: undefined,
      Buffer: undefined,
    };

    // Grant fetch only with NETWORK permission
    if (this.permissions.has('NETWORK')) {
      sandbox.fetch = fetch;
    }

    // Grant file system primitives only with FILESYSTEM permission
    if (this.permissions.has('FILESYSTEM')) {
      sandbox.Buffer = Buffer;
    }

    // Apply extra globals
    if (extraGlobals) {
      for (const [key, value] of Object.entries(extraGlobals)) {
        sandbox[key] = value;
      }
    }

    this.context = vm.createContext(sandbox, {
      name: 'plugin-sandbox',
    });

    return this.context;
  }

  async execute<T = unknown>(code: string, context?: vm.Context): Promise<T> {
    if (this.destroyed) {
      throw new Error('Sandbox has been destroyed');
    }

    const ctx = context ?? this.context;
    if (!ctx) {
      throw new Error('No sandbox context created. Call createContext() first.');
    }

    const script = new vm.Script(code, {
      filename: 'plugin.js',
    });

    return script.runInContext(ctx, {
      timeout: this.timeoutMs,
    }) as T;
  }

  destroy(): void {
    this.context = null;
    this.destroyed = true;
    logger.debug('Sandbox destroyed');
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  hasPermission(permission: PluginPermission): boolean {
    return this.permissions.has(permission);
  }

  private createSafeConsole(): Record<string, (...args: unknown[]) => void> {
    return {
      log: (...args: unknown[]) => logger.info('Plugin console.log', { args }),
      warn: (...args: unknown[]) => logger.warn('Plugin console.warn', { args }),
      error: (...args: unknown[]) => logger.error('Plugin console.error', { error: new Error(String(args[0])) }),
      info: (...args: unknown[]) => logger.info('Plugin console.info', { args }),
      debug: (...args: unknown[]) => logger.debug('Plugin console.debug', { args }),
    };
  }
}
