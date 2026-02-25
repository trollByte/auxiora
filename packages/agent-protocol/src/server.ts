import { getLogger } from '@auxiora/logger';
import type { AgentMessage } from './types.js';
import type { AgentProtocol } from './protocol.js';

const logger = getLogger('agent-protocol:server');

/**
 * HTTP endpoint handler for receiving agent messages.
 * Designed to be mounted on an Express router.
 */
export class ProtocolServer {
  private protocol: AgentProtocol;

  constructor(protocol: AgentProtocol) {
    this.protocol = protocol;
  }

  /**
   * Handle an incoming HTTP request with an agent message.
   * Returns the response message (if any) or an error.
   */
  async handleRequest(body: unknown): Promise<{
    status: number;
    body: { success: boolean; response?: AgentMessage; error?: string };
  }> {
    if (!body || typeof body !== 'object') {
      return {
        status: 400,
        body: { success: false, error: 'Invalid request body' },
      };
    }

    const message = body as AgentMessage;

    if (!message.id || !message.from || !message.to || !message.type || message.payload === undefined) {
      return {
        status: 400,
        body: { success: false, error: 'Missing required message fields' },
      };
    }

    try {
      const response = await this.protocol.receive(message);

      return {
        status: 200,
        body: {
          success: true,
          ...(response ? { response } : {}),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.debug('Failed to handle agent message', { error: error as Error });
      return {
        status: 400,
        body: { success: false, error: msg },
      };
    }
  }

  /** Get the protocol instance. */
  getProtocol(): AgentProtocol {
    return this.protocol;
  }
}
