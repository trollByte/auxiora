import { AuxioraError, ErrorCode } from '@auxiora/errors';
import { getLogger } from '@auxiora/logger';
import type { A2AMessage, A2ATask, AgentCard } from './types.js';

const logger = getLogger('a2a:client');

export class A2AClient {
  constructor(private baseUrl: string) {}

  async discoverAgent(): Promise<AgentCard> {
    const url = `${this.baseUrl}/.well-known/agent.json`;
    logger.info(`Discovering agent at ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new AuxioraError({
        code: ErrorCode.GATEWAY_CONNECTION_FAILED,
        message: `Failed to discover agent: ${response.status} ${response.statusText}`,
        retryable: response.status >= 500,
      });
    }

    return (await response.json()) as AgentCard;
  }

  async sendTask(message: A2AMessage): Promise<A2ATask> {
    const url = `${this.baseUrl}/tasks`;
    logger.info('Sending new task');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new AuxioraError({
        code: ErrorCode.GATEWAY_CONNECTION_FAILED,
        message: `Failed to send task: ${response.status} ${response.statusText}`,
        retryable: response.status >= 500,
      });
    }

    return (await response.json()) as A2ATask;
  }

  async getTaskStatus(taskId: string): Promise<A2ATask> {
    const url = `${this.baseUrl}/tasks/${taskId}`;
    logger.info(`Getting task status: ${taskId}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new AuxioraError({
        code: ErrorCode.GATEWAY_CONNECTION_FAILED,
        message: `Failed to get task status: ${response.status} ${response.statusText}`,
        retryable: response.status >= 500,
      });
    }

    return (await response.json()) as A2ATask;
  }

  async sendMessage(taskId: string, message: A2AMessage): Promise<A2ATask> {
    const url = `${this.baseUrl}/tasks/${taskId}/messages`;
    logger.info(`Sending message to task: ${taskId}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new AuxioraError({
        code: ErrorCode.GATEWAY_CONNECTION_FAILED,
        message: `Failed to send message: ${response.status} ${response.statusText}`,
        retryable: response.status >= 500,
      });
    }

    return (await response.json()) as A2ATask;
  }

  async cancelTask(taskId: string): Promise<void> {
    const url = `${this.baseUrl}/tasks/${taskId}/cancel`;
    logger.info(`Canceling task: ${taskId}`);

    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      throw new AuxioraError({
        code: ErrorCode.GATEWAY_CONNECTION_FAILED,
        message: `Failed to cancel task: ${response.status} ${response.statusText}`,
        retryable: response.status >= 500,
      });
    }
  }
}
