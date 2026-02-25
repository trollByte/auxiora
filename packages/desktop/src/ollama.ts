import { getLogger } from '@auxiora/logger';
import type { TauriBridge } from './app.js';

const logger = getLogger('desktop:ollama');

export type OllamaStatus = 'stopped' | 'starting' | 'running' | 'error';

export class OllamaBundleManager {
  private bridge: TauriBridge;
  private status: OllamaStatus = 'stopped';
  private port: number;

  constructor(bridge: TauriBridge, port = 11434) {
    this.bridge = bridge;
    this.port = port;
  }

  getStatus(): OllamaStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  async detect(): Promise<boolean> {
    const found = await this.bridge.detectOllama();
    logger.info('Ollama detection', { found });
    return found;
  }

  async start(): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Ollama is already running');
    }

    this.status = 'starting';
    try {
      await this.bridge.startOllama(this.port);
      this.status = 'running';
      logger.info('Ollama started', { port: this.port });
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.status !== 'running') {
      return;
    }

    await this.bridge.stopOllama();
    this.status = 'stopped';
    logger.info('Ollama stopped');
  }

  async listModels(): Promise<string[]> {
    if (this.status !== 'running') {
      return [];
    }
    return this.bridge.listOllamaModels();
  }
}
