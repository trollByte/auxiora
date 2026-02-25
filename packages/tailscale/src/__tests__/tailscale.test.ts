import { describe, it, expect, beforeEach } from 'vitest';
import type { CommandExecutor } from '../types.js';
import { TailscaleManager } from '../manager.js';

function makeMockRunner(): CommandExecutor & {
  calls: Array<{ command: string; args: string[] }>;
  setResponse(stdout: string, stderr?: string, exitCode?: number): void;
  setResponseForArgs(args: string[], stdout: string, stderr?: string, exitCode?: number): void;
} {
  const responses = new Map<string, { stdout: string; stderr: string; exitCode: number }>();
  let defaultResponse = { stdout: '', stderr: '', exitCode: 0 };
  const calls: Array<{ command: string; args: string[] }> = [];

  return {
    calls,
    setResponse(stdout: string, stderr = '', exitCode = 0) {
      defaultResponse = { stdout, stderr, exitCode };
    },
    setResponseForArgs(args: string[], stdout: string, stderr = '', exitCode = 0) {
      responses.set(args.join(' '), { stdout, stderr, exitCode });
    },
    async run(command: string, args: string[]) {
      calls.push({ command, args });
      const key = args.join(' ');
      return responses.get(key) ?? defaultResponse;
    },
  };
}

const TAILSCALE_STATUS_JSON = JSON.stringify({
  BackendState: 'Running',
  Self: {
    HostName: 'my-machine',
    DNSName: 'my-machine.tail1234.ts.net.',
    TailscaleIPs: ['100.64.0.1', 'fd7a:115c::1'],
  },
  CurrentTailnet: {
    Name: 'tail1234.ts.net',
  },
});

describe('TailscaleManager', () => {
  let runner: ReturnType<typeof makeMockRunner>;
  let manager: TailscaleManager;

  beforeEach(() => {
    runner = makeMockRunner();
    manager = new TailscaleManager({ enabled: true, localPort: 3000 }, runner);
  });

  it('requires a CommandExecutor', () => {
    expect(() => new TailscaleManager()).toThrow('CommandExecutor is required');
  });

  describe('detect', () => {
    it('returns true when tailscale CLI is found', async () => {
      runner.setResponse('1.62.0\n  go1.22');
      const result = await manager.detect();
      expect(result).toBe(true);
      expect(runner.calls[0]).toEqual({ command: 'tailscale', args: ['version'] });
    });

    it('returns false when tailscale CLI is not found', async () => {
      runner.setResponse('', 'command not found', 127);
      const result = await manager.detect();
      expect(result).toBe(false);
      expect(manager.getStatus()).toBe('not-installed');
    });
  });

  describe('getInfo', () => {
    it('returns not-installed if tailscale is missing', async () => {
      runner.setResponse('', 'not found', 127);
      const info = await manager.getInfo();
      expect(info.status).toBe('not-installed');
    });

    it('returns not-running if status command fails', async () => {
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], '', 'daemon not running', 1);
      const info = await manager.getInfo();
      expect(info.status).toBe('not-running');
    });

    it('returns ready with machine info when running', async () => {
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);
      const info = await manager.getInfo();
      expect(info.status).toBe('ready');
      expect(info.hostname).toBe('my-machine');
      expect(info.tailnet).toBe('tail1234.ts.net');
      expect(info.ipAddress).toBe('100.64.0.1');
    });

    it('returns not-logged-in when backend needs login', async () => {
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(
        ['status', '--json'],
        JSON.stringify({ BackendState: 'NeedsLogin' }),
        '',
        0,
      );
      const info = await manager.getInfo();
      expect(info.status).toBe('not-logged-in');
    });

    it('returns error on invalid JSON', async () => {
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], 'not-json', '', 0);
      const info = await manager.getInfo();
      expect(info.status).toBe('error');
    });
  });

  describe('serve', () => {
    it('starts tailscale serve and returns info', async () => {
      runner.setResponseForArgs(['serve', 'https://localhost:3000'], '', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);

      const info = await manager.serve();
      expect(info.status).toBe('serving');
      expect(info.serveUrl).toBe('https://my-machine.tail1234.ts.net');
      expect(manager.getActiveMode()).toBe('serve');
    });

    it('uses custom port', async () => {
      runner.setResponseForArgs(['serve', 'https://localhost:8080'], '', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);

      await manager.serve(8080);
      expect(runner.calls[0]).toEqual({
        command: 'tailscale',
        args: ['serve', 'https://localhost:8080'],
      });
    });

    it('throws on failure', async () => {
      runner.setResponse('', 'access denied', 1);
      await expect(manager.serve()).rejects.toThrow('Tailscale serve failed: access denied');
    });
  });

  describe('funnel', () => {
    it('starts tailscale funnel and returns info', async () => {
      runner.setResponseForArgs(['funnel', 'https://localhost:3000'], '', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);

      const info = await manager.funnel();
      expect(info.status).toBe('serving');
      expect(info.publicUrl).toBe('https://my-machine.tail1234.ts.net');
      expect(manager.getActiveMode()).toBe('funnel');
    });

    it('throws on failure', async () => {
      runner.setResponse('', 'funnel not enabled', 1);
      await expect(manager.funnel()).rejects.toThrow('Tailscale funnel failed: funnel not enabled');
    });
  });

  describe('stop', () => {
    it('does nothing when no active mode', async () => {
      await manager.stop();
      expect(runner.calls).toHaveLength(0);
    });

    it('stops active serve', async () => {
      runner.setResponseForArgs(['serve', 'https://localhost:3000'], '', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);
      await manager.serve();

      runner.calls.length = 0;
      runner.setResponse('', '', 0);

      await manager.stop();
      expect(runner.calls[0]).toEqual({
        command: 'tailscale',
        args: ['serve', '--remove'],
      });
      expect(manager.getActiveMode()).toBeNull();
      expect(manager.getStatus()).toBe('ready');
    });

    it('stops active funnel', async () => {
      runner.setResponseForArgs(['funnel', 'https://localhost:3000'], '', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);
      await manager.funnel();

      runner.calls.length = 0;
      runner.setResponse('', '', 0);

      await manager.stop();
      expect(runner.calls[0]).toEqual({
        command: 'tailscale',
        args: ['funnel', '--remove'],
      });
    });
  });

  describe('config', () => {
    it('uses http when https is disabled', async () => {
      const mgr = new TailscaleManager({ https: false, localPort: 3000 }, runner);
      runner.setResponse('', '', 0);
      runner.setResponseForArgs(['version'], '1.62.0', '', 0);
      runner.setResponseForArgs(['status', '--json'], TAILSCALE_STATUS_JSON, '', 0);

      await mgr.serve();
      expect(runner.calls[0]).toEqual({
        command: 'tailscale',
        args: ['serve', 'http://localhost:3000'],
      });
    });

    it('returns a copy of config', () => {
      const config = manager.getConfig();
      expect(config.localPort).toBe(3000);
      expect(config.enabled).toBe(true);
    });
  });
});
