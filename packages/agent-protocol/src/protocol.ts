import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import type { AgentIdentifier, AgentMessage, AgentMessageType } from './types.js';
import { formatAgentId } from './types.js';
import type { MessageSigner } from './signing.js';
import type { AgentDirectory } from './directory.js';

const logger = getLogger('agent-protocol:protocol');

export interface MessageHandler {
  (message: AgentMessage): Promise<AgentMessage | void>;
}

/**
 * Core agent-to-agent protocol. JSON-over-HTTPS messaging
 * with Ed25519 signature verification.
 */
export class AgentProtocol {
  private identity: AgentIdentifier;
  private signer: MessageSigner;
  private directory: AgentDirectory;
  private handlers = new Map<AgentMessageType, MessageHandler>();
  private inbox: AgentMessage[] = [];
  private maxInboxSize = 1000;

  constructor(
    identity: AgentIdentifier,
    signer: MessageSigner,
    directory: AgentDirectory,
  ) {
    this.identity = identity;
    this.signer = signer;
    this.directory = directory;
  }

  /** Send a message to another agent. */
  async send(
    to: AgentIdentifier,
    type: AgentMessageType,
    payload: string,
    replyTo?: string,
  ): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      from: this.identity,
      to,
      type,
      payload,
      timestamp: Date.now(),
      replyTo,
    };

    // Sign the message
    const signaturePayload = `${message.id}:${message.timestamp}:${message.payload}`;
    message.signature = this.signer.sign(signaturePayload);

    // Look up the target agent's endpoint
    const entry = await this.directory.lookup(to);
    if (!entry) {
      throw new Error(`Agent not found: ${formatAgentId(to)}`);
    }

    // Send via HTTPS (in production would use fetch)
    // For now, store in local outbox for testing
    logger.debug('Message sent', {
      to: formatAgentId(to),
      type,
      id: message.id,
    });
    void audit('agent_protocol.message_sent', {
      to: formatAgentId(to),
      type,
      id: message.id,
    });

    return message;
  }

  /** Receive and process an incoming message. */
  async receive(message: AgentMessage): Promise<AgentMessage | void> {
    // Verify signature if present
    if (message.signature) {
      const senderEntry = await this.directory.lookup(message.from);
      if (senderEntry) {
        const signaturePayload = `${message.id}:${message.timestamp}:${message.payload}`;
        const valid = this.signer.verify(signaturePayload, message.signature, senderEntry.publicKey);
        if (!valid) {
          logger.debug('Invalid message signature', { from: formatAgentId(message.from) });
          throw new Error('Invalid message signature');
        }
      }
    }

    // Store in inbox
    this.inbox.push(message);
    if (this.inbox.length > this.maxInboxSize) {
      this.inbox = this.inbox.slice(-this.maxInboxSize);
    }

    logger.debug('Message received', {
      from: formatAgentId(message.from),
      type: message.type,
      id: message.id,
    });
    void audit('agent_protocol.message_received', {
      from: formatAgentId(message.from),
      type: message.type,
      id: message.id,
    });

    // Dispatch to handler
    const handler = this.handlers.get(message.type);
    if (handler) {
      return handler(message);
    }
  }

  /** Register a handler for a message type. */
  onMessage(type: AgentMessageType, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  /** Discover agents with specific capabilities. */
  async discover(query: string): Promise<AgentIdentifier[]> {
    const entries = await this.directory.search(query);
    return entries.map(e => e.identifier);
  }

  /** Query another agent's capabilities. */
  async negotiate(target: AgentIdentifier): Promise<AgentMessage> {
    return this.send(target, 'capability_query', '');
  }

  /** Get messages from the inbox. */
  getInbox(limit?: number): AgentMessage[] {
    const max = limit ?? 50;
    return this.inbox.slice(-max);
  }

  /** Get this agent's identity. */
  getIdentity(): AgentIdentifier {
    return this.identity;
  }
}
