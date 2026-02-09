/** Tailscale exposure mode. */
export type TailscaleMode = 'serve' | 'funnel';

/** Configuration for Tailscale integration. */
export interface TailscaleConfig {
  /** Whether Tailscale integration is enabled. */
  enabled: boolean;
  /** Exposure mode: serve (local tailnet) or funnel (public internet). */
  mode: TailscaleMode;
  /** Custom hostname for the Tailscale machine (optional). */
  hostname?: string;
  /** Local port to proxy traffic to. */
  localPort: number;
  /** Whether to use HTTPS on the Tailscale side. */
  https: boolean;
}

export const DEFAULT_TAILSCALE_CONFIG: TailscaleConfig = {
  enabled: false,
  mode: 'serve',
  localPort: 3000,
  https: true,
};

/** Status of the Tailscale integration. */
export type TailscaleStatus =
  | 'not-installed'
  | 'not-running'
  | 'not-logged-in'
  | 'ready'
  | 'serving'
  | 'error';

/** Information about the current Tailscale state. */
export interface TailscaleInfo {
  status: TailscaleStatus;
  /** The Tailscale hostname (e.g., "my-machine"). */
  hostname?: string;
  /** The tailnet domain (e.g., "tail1234.ts.net"). */
  tailnet?: string;
  /** The public URL when serving via funnel. */
  publicUrl?: string;
  /** The local tailnet URL when serving via serve. */
  serveUrl?: string;
  /** The Tailscale IP address. */
  ipAddress?: string;
}

/** Interface for running CLI commands (injectable for testing). */
export interface CommandExecutor {
  run(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}
