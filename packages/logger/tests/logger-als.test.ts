import { describe, it, expect, vi } from 'vitest';
import { createLogger, generateRequestId } from '../src/index.js';
import { runWithRequestId } from '../src/context.js';

describe('logger ALS integration', () => {
  it('auto-injects requestId from ALS into log output', async () => {
    const logger = createLogger('test-als', { level: 'debug' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    await runWithRequestId('req_als_test', async () => {
      logger.info('test message');
    });

    expect(infoSpy).toHaveBeenCalled();
    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBe('req_als_test');
  });

  it('does not inject requestId outside ALS', () => {
    const logger = createLogger('test-no-als', { level: 'debug' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    logger.info('test message');

    expect(infoSpy).toHaveBeenCalled();
    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBeUndefined();
  });

  it('explicit requestId takes priority over ALS', async () => {
    const logger = createLogger('test-priority', { level: 'debug', requestId: 'req_explicit' });
    const pinoLogger = logger.getPinoLogger();
    const infoSpy = vi.spyOn(pinoLogger, 'info');

    await runWithRequestId('req_als_ignored', async () => {
      logger.info('test message');
    });

    const loggedContext = infoSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(loggedContext.requestId).toBe('req_explicit');
  });

  it('generateRequestId returns req_ prefixed string', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^req_\d+_[a-z0-9]+$/);
  });
});
