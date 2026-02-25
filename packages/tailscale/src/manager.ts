import { getLogger } from '@auxiora/logger';
import type {
  TailscaleConfig,
  TailscaleInfo,
  TailscaleMode,
  TailscaleStatus,
  CommandExecutor,
} from './types.js';
import { DEFAULT_TAILSCALE_CONFIG } from './types.js';

const logger = getLogger('tailscale');

/**
 * Manages Tailscale Serve and Funnel for exposing Auxiora
 * to the local tailnet or the public internet.
 */
export class TailscaleManager {
  private config: TailscaleConfig;
  private runner: CommandExecutor;
  private currentStatus: TailscaleStatus = 'not-installed';
  private activeMode: TailscaleMode | null = null;

  constructor(config?: Partial<TailscaleConfig>, runner?: CommandExecutor) {
    this.config = { ...DEFAULT_TAILSCALE_CONFIG, ...config };
    if (!runner) {
      throw new Error('CommandExecutor is required — use ProcessCommandRunner for production');
    }
    this.runner = runner;
  }

  /** Detect whether the Tailscale CLI is installed and reachable. */
  async detect(): Promise<boolean> {
    const result = await this.runner.run('tailscale', ['version']);
    if (result.exitCode !== 0) {
      this.currentStatus = 'not-installed';
      logger.debug('Tailscale CLI not found');
      return false;
    }
    logger.info('Tailscale CLI detected', { version: result.stdout.trim().split('\n')[0] });
    return true;
  }

  /** Get detailed status information from Tailscale. */
  async getInfo(): Promise<TailscaleInfo> {
    const installed = await this.detect();
    if (!installed) {
      return { status: 'not-installed' };
    }

    const result = await this.runner.run('tailscale', ['status', '--json']);
    if (result.exitCode !== 0) {
      this.currentStatus = 'not-running';
      return { status: 'not-running' };
    }

    try {
      const status = JSON.parse(result.stdout) as {
        Self?: {
          HostName?: string;
          DNSName?: string;
          TailscaleIPs?: string[];
        };
        CurrentTailnet?: { Name?: string };
        BackendState?: string;
      };

      if (status.BackendState !== 'Running') {
        this.currentStatus = status.BackendState === 'NeedsLogin' ? 'not-logged-in' : 'not-running';
        return { status: this.currentStatus };
      }

      const hostname = status.Self?.HostName;
      const dnsName = status.Self?.DNSName;
      const tailnet = status.CurrentTailnet?.Name;
      const ipAddress = status.Self?.TailscaleIPs?.[0];

      this.currentStatus = this.activeMode ? 'serving' : 'ready';

      const info: TailscaleInfo = {
        status: this.currentStatus,
        hostname,
        tailnet,
        ipAddress,
      };

      if (dnsName && this.activeMode === 'serve') {
        info.serveUrl = `https://${dnsName.replace(/\.$/, '')}`;
      }
      if (dnsName && this.activeMode === 'funnel') {
        info.publicUrl = `https://${dnsName.replace(/\.$/, '')}`;
      }

      return info;
    } catch {
      this.currentStatus = 'error';
      return { status: 'error' };
    }
  }

  /** Start Tailscale Serve — expose Auxiora on the local tailnet. */
  async serve(port?: number): Promise<TailscaleInfo> {
    const targetPort = port ?? this.config.localPort;
    logger.info('Starting Tailscale Serve', { port: targetPort });

    const proto = this.config.https ? 'https' : 'http';
    const result = await this.runner.run('tailscale', [
      'serve',
      `${proto}://localhost:${targetPort}`,
    ]);

    if (result.exitCode !== 0) {
      logger.error('Failed to start Tailscale Serve', { error: new Error(result.stderr) });
      throw new Error(`Tailscale serve failed: ${result.stderr}`);
    }

    this.activeMode = 'serve';
    this.currentStatus = 'serving';
    logger.info('Tailscale Serve started');
    return this.getInfo();
  }

  /** Start Tailscale Funnel — expose Auxiora to the public internet. */
  async funnel(port?: number): Promise<TailscaleInfo> {
    const targetPort = port ?? this.config.localPort;
    logger.info('Starting Tailscale Funnel', { port: targetPort });

    const proto = this.config.https ? 'https' : 'http';
    const result = await this.runner.run('tailscale', [
      'funnel',
      `${proto}://localhost:${targetPort}`,
    ]);

    if (result.exitCode !== 0) {
      logger.error('Failed to start Tailscale Funnel', { error: new Error(result.stderr) });
      throw new Error(`Tailscale funnel failed: ${result.stderr}`);
    }

    this.activeMode = 'funnel';
    this.currentStatus = 'serving';
    logger.info('Tailscale Funnel started');
    return this.getInfo();
  }

  /** Stop any active Tailscale Serve or Funnel. */
  async stop(): Promise<void> {
    if (!this.activeMode) {
      logger.debug('No active Tailscale serve/funnel to stop');
      return;
    }

    logger.info('Stopping Tailscale serve/funnel', { mode: this.activeMode });

    const command = this.activeMode === 'funnel' ? 'funnel' : 'serve';
    const result = await this.runner.run('tailscale', [command, '--remove']);

    if (result.exitCode !== 0) {
      logger.warn('Failed to cleanly stop Tailscale', { error: new Error(result.stderr) });
    }

    this.activeMode = null;
    this.currentStatus = 'ready';
    logger.info('Tailscale stopped');
  }

  /** Get the current status. */
  getStatus(): TailscaleStatus {
    return this.currentStatus;
  }

  /** Get the active mode (serve, funnel, or null). */
  getActiveMode(): TailscaleMode | null {
    return this.activeMode;
  }

  /** Get the current config. */
  getConfig(): TailscaleConfig {
    return { ...this.config };
  }
}
