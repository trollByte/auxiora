import { describe, it, expect, vi } from 'vitest';
import type { AutoFixActions } from '@auxiora/introspection';

/**
 * These tests exercise the auto-fix action logic in isolation by recreating the
 * same closures that Auxiora.initialize() builds, but with mocked dependencies.
 */

function createAutoFixActions(deps: {
  channels?: {
    disconnect: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  };
  behaviors?: {
    update: ReturnType<typeof vi.fn>;
  };
  providers: {
    getFallbackProvider: ReturnType<typeof vi.fn>;
    setPrimary: ReturnType<typeof vi.fn>;
  };
  config: { provider: { fallback?: string } };
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
}): AutoFixActions {
  const { channels, behaviors, providers, config, logger } = deps;

  return {
    reconnectChannel: async (type) => {
      if (!channels) return false;
      try {
        await channels.disconnect(type as any);
        await channels.connect(type as any);
        logger.info('Auto-fix: reconnected channel', { type });
        return true;
      } catch (err) {
        logger.warn('Auto-fix: channel reconnect failed', { type, error: err instanceof Error ? err : new Error(String(err)) });
        return false;
      }
    },
    restartBehavior: async (id) => {
      if (!behaviors) return false;
      try {
        const result = await behaviors.update(id, { status: 'active' });
        if (!result) return false;
        logger.info('Auto-fix: restarted behavior', { id });
        return true;
      } catch (err) {
        logger.warn('Auto-fix: behavior restart failed', { id, error: err instanceof Error ? err : new Error(String(err)) });
        return false;
      }
    },
    switchToFallbackProvider: async () => {
      const fallbackName = config.provider.fallback;
      if (!fallbackName) return false;
      const fallback = providers.getFallbackProvider();
      if (!fallback) return false;
      try {
        providers.setPrimary(fallbackName);
        logger.info('Auto-fix: switched to fallback provider', { name: fallbackName });
        return true;
      } catch (err) {
        logger.warn('Auto-fix: provider switch failed', { error: err instanceof Error ? err : new Error(String(err)) });
        return false;
      }
    },
  };
}

function makeDeps(overrides?: Partial<Parameters<typeof createAutoFixActions>[0]>) {
  return {
    channels: {
      disconnect: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
    },
    behaviors: {
      update: vi.fn().mockResolvedValue({ id: 'bh_123', status: 'active' }),
    },
    providers: {
      getFallbackProvider: vi.fn().mockReturnValue({ metadata: { displayName: 'OpenAI' } }),
      setPrimary: vi.fn(),
    },
    config: { provider: { fallback: 'openai' } },
    logger: { info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

describe('AutoFixActions', () => {
  describe('reconnectChannel', () => {
    it('calls disconnect then connect and returns true', async () => {
      const deps = makeDeps();
      const actions = createAutoFixActions(deps);

      const result = await actions.reconnectChannel!('discord');

      expect(result).toBe(true);
      expect(deps.channels.disconnect).toHaveBeenCalledWith('discord');
      expect(deps.channels.connect).toHaveBeenCalledWith('discord');
    });

    it('returns false when connect throws', async () => {
      const deps = makeDeps();
      deps.channels.connect.mockRejectedValue(new Error('Connection refused'));
      const actions = createAutoFixActions(deps);

      const result = await actions.reconnectChannel!('discord');

      expect(result).toBe(false);
      expect(deps.logger.warn).toHaveBeenCalled();
    });

    it('returns false when channels is not available', async () => {
      const deps = makeDeps({ channels: undefined });
      const actions = createAutoFixActions(deps);

      const result = await actions.reconnectChannel!('discord');

      expect(result).toBe(false);
    });
  });

  describe('restartBehavior', () => {
    it('calls behaviors.update with active status and returns true', async () => {
      const deps = makeDeps();
      const actions = createAutoFixActions(deps);

      const result = await actions.restartBehavior!('bh_123');

      expect(result).toBe(true);
      expect(deps.behaviors.update).toHaveBeenCalledWith('bh_123', { status: 'active' });
    });

    it('returns false when behavior not found (update returns undefined)', async () => {
      const deps = makeDeps();
      deps.behaviors.update.mockResolvedValue(undefined);
      const actions = createAutoFixActions(deps);

      const result = await actions.restartBehavior!('bh_999');

      expect(result).toBe(false);
    });

    it('returns false when behaviors manager is not available', async () => {
      const deps = makeDeps({ behaviors: undefined });
      const actions = createAutoFixActions(deps);

      const result = await actions.restartBehavior!('bh_123');

      expect(result).toBe(false);
    });
  });

  describe('switchToFallbackProvider', () => {
    it('gets fallback and calls setPrimary, returns true', async () => {
      const deps = makeDeps();
      const actions = createAutoFixActions(deps);

      const result = await actions.switchToFallbackProvider!();

      expect(result).toBe(true);
      expect(deps.providers.setPrimary).toHaveBeenCalledWith('openai');
    });

    it('returns false when no fallback configured', async () => {
      const deps = makeDeps();
      deps.config.provider.fallback = undefined;
      const actions = createAutoFixActions(deps);

      const result = await actions.switchToFallbackProvider!();

      expect(result).toBe(false);
    });

    it('returns false when getFallbackProvider returns null', async () => {
      const deps = makeDeps();
      deps.providers.getFallbackProvider.mockReturnValue(null);
      const actions = createAutoFixActions(deps);

      const result = await actions.switchToFallbackProvider!();

      expect(result).toBe(false);
    });
  });
});
