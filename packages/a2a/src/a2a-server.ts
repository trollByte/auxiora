import { AuxioraError, ErrorCode } from '@auxiora/errors';
import { getLogger } from '@auxiora/logger';
import type { A2AMessage, A2ATask, AgentCard } from './types.js';
import type { TaskManager } from './task-manager.js';

const logger = getLogger('a2a:server');

export interface A2AResponse {
  status: number;
  body: unknown;
}

export class A2AServer {
  constructor(
    private card: AgentCard,
    private taskManager: TaskManager,
    private taskHandler: (task: A2ATask) => Promise<void>,
  ) {}

  async handleRequest(method: string, path: string, body?: unknown): Promise<A2AResponse> {
    try {
      if (method === 'GET' && path === '/.well-known/agent.json') {
        return { status: 200, body: this.card };
      }

      if (method === 'POST' && path === '/tasks') {
        return await this.handleCreateTask(body);
      }

      const taskMatch = path.match(/^\/tasks\/([^/]+)$/);
      if (taskMatch) {
        const taskId = taskMatch[1];

        if (method === 'GET') {
          return this.handleGetTask(taskId);
        }
      }

      const messageMatch = path.match(/^\/tasks\/([^/]+)\/messages$/);
      if (messageMatch && method === 'POST') {
        return await this.handleAddMessage(messageMatch[1], body);
      }

      const cancelMatch = path.match(/^\/tasks\/([^/]+)\/cancel$/);
      if (cancelMatch && method === 'POST') {
        return this.handleCancelTask(cancelMatch[1]);
      }

      return { status: 404, body: { error: 'Not found' } };
    } catch (error) {
      if (error instanceof AuxioraError) {
        logger.warn(`Request error: ${error.message}`);
        return { status: 400, body: { error: error.message } };
      }
      logger.error('Unexpected error', error instanceof Error ? error : new Error(String(error)));
      return { status: 500, body: { error: 'Internal server error' } };
    }
  }

  private async handleCreateTask(body: unknown): Promise<A2AResponse> {
    const { message } = body as { message: A2AMessage };
    if (!message) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Request body must include a message',
        retryable: false,
      });
    }

    const task = this.taskManager.createTask(message);
    this.taskManager.updateState(task.id, 'working');
    logger.info(`Task created via server: ${task.id}`);

    this.taskHandler(task).catch((err) => {
      logger.error('Task handler failed', err instanceof Error ? err : new Error(String(err)));
      try {
        this.taskManager.updateState(task.id, 'failed');
      } catch {
        // Task may already be in a terminal state
      }
    });

    return { status: 201, body: task };
  }

  private handleGetTask(taskId: string): A2AResponse {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      return { status: 404, body: { error: `Task not found: ${taskId}` } };
    }
    return { status: 200, body: task };
  }

  private async handleAddMessage(taskId: string, body: unknown): Promise<A2AResponse> {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      return { status: 404, body: { error: `Task not found: ${taskId}` } };
    }

    const { message } = body as { message: A2AMessage };
    if (!message) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Request body must include a message',
        retryable: false,
      });
    }

    this.taskManager.addMessage(taskId, message);

    this.taskHandler(task).catch((err) => {
      logger.error('Task handler failed', err instanceof Error ? err : new Error(String(err)));
    });

    return { status: 200, body: task };
  }

  private handleCancelTask(taskId: string): A2AResponse {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      return { status: 404, body: { error: `Task not found: ${taskId}` } };
    }

    this.taskManager.cancelTask(taskId);
    return { status: 200, body: this.taskManager.getTask(taskId) };
  }
}
