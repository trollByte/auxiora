import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import http, { type Server as HttpServer } from 'node:http';
const createServer = http.createServer.bind(http);
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Config } from '@auxiora/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const AUXIORA_VERSION: string = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
import { audit } from '@auxiora/audit';
import { getLogger, generateRequestId, runWithRequestId } from '@auxiora/logger';
import { paths } from '@auxiora/core';
import { RateLimiter } from './rate-limiter.js';

const logger = getLogger('gateway');
import { PairingManager } from './pairing.js';
import type { ClientConnection, WsMessage } from './types.js';

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

interface FeatureStatus {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  configured: boolean;
  active: boolean;
  missing?: string[];
  settingsPath?: string | null;
}

export type { ClientConnection, WsMessage };

export interface GatewayOptions {
  config: Config;
  needsSetup?: () => Promise<boolean>;
}

export class Gateway {
  private app: Express;
  private server: HttpServer;
  private wss: WebSocketServer;
  private config: Config;
  private rateLimiter: RateLimiter;
  private pairingManager: PairingManager;
  private clients: Map<string, ClientConnection> = new Map();
  private messageHandler?: (client: ClientConnection, message: WsMessage) => Promise<void>;
  private voiceHandler?: (client: ClientConnection, type: string, payload: unknown, audioBuffer?: Buffer) => Promise<void>;
  private audioBuffers = new Map<string, { frames: Buffer[]; size: number }>();
  private needsSetup?: () => Promise<boolean>;

  constructor(options: GatewayOptions) {
    this.config = options.config;
    this.needsSetup = options.needsSetup;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.rateLimiter = new RateLimiter({
      windowMs: this.config.rateLimit.windowMs,
      maxRequests: this.config.rateLimit.maxRequests,
    });

    this.pairingManager = new PairingManager({
      codeLength: this.config.pairing.codeLength,
      expiryMinutes: this.config.pairing.expiryMinutes,
      autoApproveChannels: this.config.pairing.autoApproveChannels,
      persistPath: this.config.pairing.persistPath,
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies (limit to 1MB; marketplace handles large uploads separately)
    this.app.use(express.json({ limit: '1mb' }));

    // CORS
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      if (origin && this.config.gateway.corsOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Security headers
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('X-Permitted-Cross-Domain-Policies', 'none');
      res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:");
      res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    });

    // Rate limiting
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (!this.config.rateLimit.enabled) {
        next();
        return;
      }

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const result = this.rateLimiter.check(ip);

      res.header('X-RateLimit-Limit', String(this.config.rateLimit.maxRequests));
      res.header('X-RateLimit-Remaining', String(result.remaining));
      res.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

      if (!result.allowed) {
        audit('rate_limit.exceeded', { ip });
        res.status(429).json({ error: 'Too many requests' });
        return;
      }

      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        version: AUXIORA_VERSION,
        uptime: process.uptime(),
      });
    });

    // API info
    this.app.get('/api/v1', (req: Request, res: Response) => {
      res.json({
        name: 'Auxiora Gateway',
        version: AUXIORA_VERSION,
        endpoints: {
          health: '/health',
          sessions: '/api/v1/sessions',
          pairing: '/api/v1/pairing',
        },
      });
    });

    // Update status endpoint
    this.app.get('/api/v1/update/status', async (_req: Request, res: Response) => {
      try {
        const { InstallationDetector, VersionChecker } = await import('@auxiora/updater');
        const detector = new InstallationDetector();
        const info = detector.detect();
        const checker = new VersionChecker('trollByte', 'auxiora');
        const checkResult = await checker.check(info.currentVersion, 'stable');

        res.json({
          currentVersion: info.currentVersion,
          installMethod: info.method,
          canSelfUpdate: info.canSelfUpdate,
          updateAvailable: checkResult.available,
          latestVersion: checkResult.latestVersion,
          channel: 'stable',
        });
      } catch {
        res.status(500).json({ error: 'Failed to check update status' });
      }
    });

    // Feature status endpoint
    this.app.get('/api/v1/features/status', (_req: Request, res: Response) => {
      const channels = this.config.channels;
      const channelDefs: Array<{ id: string; name: string; key: keyof typeof channels }> = [
        { id: 'discord', name: 'Discord', key: 'discord' },
        { id: 'telegram', name: 'Telegram', key: 'telegram' },
        { id: 'slack', name: 'Slack', key: 'slack' },
        { id: 'signal', name: 'Signal', key: 'signal' },
        { id: 'email', name: 'Email', key: 'email' },
        { id: 'teams', name: 'Teams', key: 'teams' },
        { id: 'matrix', name: 'Matrix', key: 'matrix' },
        { id: 'whatsapp', name: 'WhatsApp', key: 'whatsapp' },
        { id: 'webchat', name: 'Webchat', key: 'webchat' },
      ];

      const channelFeatures: FeatureStatus[] = channelDefs.map(ch => {
        const enabled = channels[ch.key]?.enabled ?? false;
        return {
          id: ch.id,
          name: ch.name,
          category: 'channel',
          enabled,
          configured: enabled,
          active: enabled,
          settingsPath: '/settings/channels',
        };
      });

      const capabilityDefs: Array<{ id: string; name: string; enabled: boolean }> = [
        { id: 'plugins', name: 'Plugins', enabled: this.config.plugins?.enabled ?? false },
        { id: 'webhooks', name: 'Webhooks', enabled: this.config.webhooks?.enabled ?? false },
        { id: 'research', name: 'Research', enabled: this.config.research?.enabled ?? false },
        { id: 'behaviors', name: 'Behaviors', enabled: true },
        { id: 'memory', name: 'Memory', enabled: this.config.memory?.enabled ?? false },
        { id: 'orchestration', name: 'Orchestration', enabled: this.config.orchestration?.enabled ?? false },
      ];

      const capabilityFeatures: FeatureStatus[] = capabilityDefs.map(cap => ({
        id: cap.id,
        name: cap.name,
        category: 'capability',
        enabled: cap.enabled,
        configured: cap.enabled,
        active: cap.enabled,
        settingsPath: null,
      }));

      const voiceEnabled = this.config.voice?.enabled ?? false;
      capabilityFeatures.push({
        id: 'voice',
        name: 'Voice',
        category: 'capability',
        enabled: voiceEnabled,
        configured: voiceEnabled,
        active: voiceEnabled,
        missing: voiceEnabled ? undefined : ['whisper-cli or OPENAI_API_KEY (STT)', 'piper or OPENAI_API_KEY (TTS)'],
        settingsPath: '/settings/voice',
      });

      res.json({ features: [...channelFeatures, ...capabilityFeatures] });
    });

    // Pairing endpoints
    this.app.get('/api/v1/pairing/pending', (req: Request, res: Response) => {
      const pending = this.pairingManager.getPendingCodes();
      res.json({ pending });
    });

    this.app.post('/api/v1/pairing/accept', (req: Request, res: Response) => {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ error: 'Missing code' });
        return;
      }

      const success = this.pairingManager.acceptCode(code);
      if (success) {
        audit('pairing.code_accepted', { code });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Invalid or expired code' });
      }
    });

    this.app.post('/api/v1/pairing/reject', (req: Request, res: Response) => {
      const { code } = req.body;
      if (!code) {
        res.status(400).json({ error: 'Missing code' });
        return;
      }

      const success = this.pairingManager.rejectCode(code);
      if (success) {
        audit('pairing.code_rejected', { code });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Invalid or expired code' });
      }
    });

    this.app.get('/api/v1/pairing/allowed', (req: Request, res: Response) => {
      const allowed = this.pairingManager.getAllowedSenders();
      res.json({ allowed });
    });

    // Root redirects to dashboard
    this.app.get('/', (req: Request, res: Response) => {
      res.redirect('/dashboard');
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = crypto.randomUUID();
      const ip = req.socket.remoteAddress || 'unknown';

      const client: ClientConnection = {
        id: clientId,
        ws,
        authenticated: this.config.auth.mode === 'none',
        channelType: 'webchat',
        lastActive: Date.now(),
      };

      this.clients.set(clientId, client);

      audit('channel.connected', { clientId, ip, channelType: 'webchat' });

      // Send welcome message
      this.send(client, {
        type: 'connected',
        payload: {
          clientId,
          authenticated: client.authenticated,
          requiresAuth: this.config.auth.mode !== 'none',
        },
      });

      ws.on('message', async (data: RawData, isBinary: boolean) => {
        client.lastActive = Date.now();

        if (isBinary) {
          this.handleAudioFrame(client, data as Buffer);
          return;
        }

        try {
          const message = JSON.parse(data.toString()) as WsMessage;
          await this.handleMessage(client, message);
        } catch (error) {
          this.send(client, {
            type: 'error',
            payload: { message: 'Invalid message format' },
          });
        }
      });

      ws.on('close', () => {
        this.audioBuffers.delete(clientId);
        this.clients.delete(clientId);
        audit('channel.disconnected', { clientId });
      });

      ws.on('error', (error) => {
        audit('channel.error', { clientId, error: error.message });
      });
    });
  }

  private async handleMessage(client: ClientConnection, message: WsMessage): Promise<void> {
    const requestId = generateRequestId();
    return runWithRequestId(requestId, async () => {
    const { type, id, payload } = message;

    switch (type) {
      case 'ping':
        this.send(client, { type: 'pong', id });
        break;

      case 'auth':
        await this.handleAuth(client, payload as { password?: string; token?: string }, id);
        break;

      case 'message':
        if (!client.authenticated) {
          this.send(client, {
            type: 'error',
            id,
            payload: { message: 'Not authenticated' },
          });
          return;
        }

        audit('message.received', {
          clientId: client.id,
          senderId: client.senderId,
        });

        // Delegate to message handler if set
        if (this.messageHandler) {
          await this.messageHandler(client, message);
        } else {
          // Echo for now (will be replaced with AI handling)
          this.send(client, {
            type: 'message',
            id,
            payload: {
              role: 'assistant',
              content: `Echo: ${(payload as { content?: string })?.content || ''}`,
            },
          });
        }
        break;

      case 'architect_correction':
        if (!client.authenticated) {
          this.send(client, {
            type: 'error',
            id,
            payload: { message: 'Not authenticated' },
          });
          return;
        }
        if (this.messageHandler) {
          await this.messageHandler(client, message);
        }
        break;

      case 'voice_start':
      case 'voice_end':
      case 'voice_cancel':
        if (!client.authenticated) {
          this.send(client, {
            type: 'error',
            id,
            payload: { message: 'Not authenticated' },
          });
          return;
        }
        await this.handleVoiceControl(client, type, payload, id);
        break;

      default:
        this.send(client, {
          type: 'error',
          id,
          payload: { message: `Unknown message type: ${type}` },
        });
    }
    }); // end runWithRequestId
  }

  private async handleAuth(
    client: ClientConnection,
    payload: { password?: string; token?: string },
    requestId?: string
  ): Promise<void> {
    if (this.config.auth.mode === 'none') {
      client.authenticated = true;
      this.send(client, { type: 'auth_success', id: requestId });
      return;
    }

    if (this.config.auth.mode === 'password') {
      if (!payload.password) {
        audit('auth.failed', { clientId: client.id, reason: 'missing_password' });
        this.send(client, {
          type: 'auth_failure',
          id: requestId,
          payload: { message: 'Password required' },
        });
        return;
      }

      // Verify password against stored hash
      const passwordHash = this.config.auth.passwordHash;
      if (!passwordHash) {
        audit('auth.failed', { clientId: client.id, reason: 'no_password_configured' });
        this.send(client, {
          type: 'auth_failure',
          id: requestId,
          payload: { message: 'Password auth not configured. Run: auxiora auth set-password' },
        });
        return;
      }

      try {
        const valid = await argon2.verify(passwordHash, payload.password);
        if (valid) {
          client.authenticated = true;
          audit('auth.login', { clientId: client.id, method: 'password' });
          this.send(client, { type: 'auth_success', id: requestId });
        } else {
          audit('auth.failed', { clientId: client.id, reason: 'invalid_password' });
          this.send(client, {
            type: 'auth_failure',
            id: requestId,
            payload: { message: 'Invalid password' },
          });
        }
      } catch (error) {
        audit('auth.failed', { clientId: client.id, reason: 'password_verify_error' });
        this.send(client, {
          type: 'auth_failure',
          id: requestId,
          payload: { message: 'Authentication error' },
        });
      }
      return;
    }

    // JWT auth
    if (!payload.token) {
      audit('auth.failed', { clientId: client.id, reason: 'missing_token' });
      this.send(client, {
        type: 'auth_failure',
        id: requestId,
        payload: { message: 'Token required' },
      });
      return;
    }

    const jwtSecret = this.config.auth.jwtSecret;
    if (!jwtSecret) {
      audit('auth.failed', { clientId: client.id, reason: 'no_jwt_secret_configured' });
      this.send(client, {
        type: 'auth_failure',
        id: requestId,
        payload: { message: 'JWT auth not configured. Set auth.jwtSecret in config' },
      });
      return;
    }

    try {
      const decoded = jwt.verify(payload.token, jwtSecret) as JwtPayload;
      client.authenticated = true;
      client.senderId = decoded.sub;
      audit('auth.login', { clientId: client.id, method: 'jwt', subject: decoded.sub });
      this.send(client, { type: 'auth_success', id: requestId });
    } catch (error) {
      const reason = error instanceof jwt.TokenExpiredError ? 'token_expired' :
                     error instanceof jwt.JsonWebTokenError ? 'invalid_token' : 'jwt_error';
      audit('auth.failed', { clientId: client.id, reason });
      this.send(client, {
        type: 'auth_failure',
        id: requestId,
        payload: { message: reason === 'token_expired' ? 'Token expired' : 'Invalid token' },
      });
    }
  }

  private send(client: ClientConnection, message: object): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  public broadcast(message: object, filter?: (client: ClientConnection) => boolean): void {
    for (const client of this.clients.values()) {
      if (!filter || filter(client)) {
        this.send(client, message);
      }
    }
  }

  public onVoiceMessage(handler: (client: ClientConnection, type: string, payload: unknown, audioBuffer?: Buffer) => Promise<void>): void {
    this.voiceHandler = handler;
  }

  public sendBinary(client: ClientConnection, data: Buffer): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }

  public mountRouter(path: string, router: import('express').Router): void {
    this.app.use(path, router);
  }

  public getApp(): Express {
    return this.app;
  }

  private handleAudioFrame(client: ClientConnection, frame: Buffer): void {
    if (!client.authenticated || !client.voiceActive) return;

    const maxFrame = 64 * 1024;
    const maxBuffer = 960_000;

    if (frame.length > maxFrame) return;

    const buf = this.audioBuffers.get(client.id);
    if (!buf) return;

    if (buf.size + frame.length > maxBuffer) return;

    buf.frames.push(frame);
    buf.size += frame.length;
  }

  private async handleVoiceControl(client: ClientConnection, type: string, payload: unknown, requestId?: string): Promise<void> {
    if (type === 'voice_start') {
      client.voiceActive = true;
      this.audioBuffers.set(client.id, { frames: [], size: 0 });
    }

    let audioBuffer: Buffer | undefined;
    if (type === 'voice_end') {
      const buf = this.audioBuffers.get(client.id);
      if (buf && buf.frames.length > 0) {
        audioBuffer = Buffer.concat(buf.frames);
      }
      this.audioBuffers.delete(client.id);
      client.voiceActive = false;
    }

    if (type === 'voice_cancel') {
      this.audioBuffers.delete(client.id);
      client.voiceActive = false;
    }

    if (this.voiceHandler) {
      await this.voiceHandler(client, type, payload, audioBuffer);
    }
  }

  public onMessage(handler: (client: ClientConnection, message: WsMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  public getClient(id: string): ClientConnection | undefined {
    return this.clients.get(id);
  }

  public getConnections(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  public getPairingManager(): PairingManager {
    return this.pairingManager;
  }

  public async start(): Promise<void> {
    const { host, port } = this.config.gateway;

    await new Promise<void>((resolve) => {
      this.server.listen(port, host, () => {
        audit('system.startup', { host, port });
        logger.info(`Auxiora Gateway running at http://${host}:${port}`);
        resolve();
      });
    });

    // Start marketplace registry sidecar if enabled
    const marketplace = (this.config as Record<string, unknown>).marketplace as
      | { enabled?: boolean; dataDir?: string; port?: number; apiKeys?: string[] }
      | undefined;
    if (marketplace?.enabled) {
      try {
        const { createRegistryServer } = await import('@auxiora/marketplace');
        const registryServer = await createRegistryServer({
          dataDir: marketplace.dataDir ?? path.join(paths.data(), 'registry'),
          port: marketplace.port ?? 18801,
          apiKeys: marketplace.apiKeys ?? [],
        });
        await registryServer.listen({ port: marketplace.port ?? 18801, host: '127.0.0.1' });
        logger.info(`Marketplace registry listening on port ${marketplace.port ?? 18801}`);

        // Reverse proxy: /api/v1/marketplace/* → marketplace sidecar
        const marketplacePort = marketplace.port ?? 18801;
        this.app.all('/api/v1/marketplace/*', (req: Request, res: Response) => {
          const targetPath = '/api/v1' + req.url.replace('/api/v1/marketplace', '');
          const proxyReq = http.request(
            {
              hostname: '127.0.0.1',
              port: marketplacePort,
              path: targetPath,
              method: req.method,
              headers: { ...req.headers, host: `127.0.0.1:${marketplacePort}` },
            },
            (proxyRes) => {
              res.status(proxyRes.statusCode ?? 502);
              for (const [key, value] of Object.entries(proxyRes.headers)) {
                if (value) res.setHeader(key, value);
              }
              proxyRes.pipe(res);
            },
          );
          proxyReq.on('error', (err) => {
            logger.warn('Marketplace proxy error', { error: err instanceof Error ? err : new Error(String(err)) });
            res.status(502).json({ error: 'Marketplace unavailable' });
          });
          if (req.body && typeof req.body === 'object') {
            proxyReq.write(JSON.stringify(req.body));
          }
          proxyReq.end();
        });
      } catch (err) {
        logger.warn(`Failed to start marketplace registry sidecar: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close all WebSocket connections
      for (const client of this.clients.values()) {
        client.ws.close(1001, 'Server shutting down');
      }
      this.clients.clear();

      // Cleanup
      this.pairingManager.destroy();
      this.rateLimiter.destroy();

      // Close server
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          audit('system.shutdown', {});
          resolve();
        }
      });
    });
  }

  private getWebChatHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auxiora</title>
  <link rel="icon" href="/dashboard/icon.svg" type="image/svg+xml">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1rem;
      background: #12121a;
      border-bottom: 1px solid #2a2a3a;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    header h1 { font-size: 1.25rem; font-weight: 600; }
    .status {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #666;
    }
    .status.connected { background: #22c55e; }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .message {
      max-width: 80%;
      padding: 0.75rem 1rem;
      border-radius: 1rem;
      line-height: 1.5;
    }
    .message.user {
      align-self: flex-end;
      background: #3b82f6;
      color: white;
      border-bottom-right-radius: 0.25rem;
    }
    .message.assistant {
      align-self: flex-start;
      background: #1e1e2e;
      border-bottom-left-radius: 0.25rem;
    }
    .message.system {
      align-self: center;
      background: transparent;
      color: #888;
      font-size: 0.875rem;
    }
    #input-area {
      padding: 1rem;
      background: #12121a;
      border-top: 1px solid #2a2a3a;
      display: flex;
      gap: 0.5rem;
    }
    #input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 1px solid #2a2a3a;
      border-radius: 1.5rem;
      background: #0a0a0f;
      color: #e0e0e0;
      font-size: 1rem;
      outline: none;
    }
    #input:focus { border-color: #3b82f6; }
    #send {
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 1.5rem;
      font-size: 1rem;
      cursor: pointer;
    }
    #send:hover { background: #2563eb; }
    #send:disabled { background: #444; cursor: not-allowed; }
    .dashboard-link {
      margin-left: auto;
      color: #888;
      text-decoration: none;
      font-size: 0.85rem;
      padding: 0.4rem 0.75rem;
      border: 1px solid #2a2a3a;
      border-radius: 1rem;
      transition: color 0.2s, border-color 0.2s;
    }
    .dashboard-link:hover { color: #3b82f6; border-color: #3b82f6; }
  </style>
</head>
<body>
  <header>
    <div class="status" id="status"></div>
    <h1>Auxiora</h1>
    <a href="/dashboard" class="dashboard-link">Dashboard</a>
  </header>
  <div id="messages"></div>
  <div id="input-area">
    <input type="text" id="input" placeholder="Type a message..." autocomplete="off">
    <button id="send">Send</button>
  </div>

  <script>
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const status = document.getElementById('status');

    let ws;
    let authenticated = false;
    let messageId = 0;

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host);

      ws.onopen = () => {
        status.classList.add('connected');
        addMessage('system', 'Connected to Auxiora');
      };

      ws.onclose = () => {
        status.classList.remove('connected');
        addMessage('system', 'Disconnected. Reconnecting...');
        setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      };
    }

    function handleMessage(msg) {
      switch (msg.type) {
        case 'connected':
          authenticated = msg.payload.authenticated;
          if (!authenticated && !msg.payload.requiresAuth) {
            authenticated = true;
          }
          break;
        case 'auth_success':
          authenticated = true;
          addMessage('system', 'Authenticated');
          break;
        case 'message':
          addMessage(msg.payload.role || 'assistant', msg.payload.content);
          break;
        case 'chunk':
          appendToLast(msg.payload.content);
          break;
        case 'error':
          addMessage('system', 'Error: ' + msg.payload.message);
          break;
      }
    }

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = content;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendToLast(content) {
      const last = messages.lastElementChild;
      if (last && last.classList.contains('assistant')) {
        last.textContent += content;
      } else {
        addMessage('assistant', content);
      }
      messages.scrollTop = messages.scrollHeight;
    }

    function sendMessage() {
      const text = input.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

      addMessage('user', text);
      ws.send(JSON.stringify({
        type: 'message',
        id: String(++messageId),
        payload: { content: text }
      }));
      input.value = '';
    }

    send.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

    connect();
  </script>
</body>
</html>`;
  }
}
