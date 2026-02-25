import { randomUUID } from 'node:crypto';
import { AuxioraError, ErrorCode } from '@auxiora/errors';
import { getLogger } from '@auxiora/logger';
import type { A2AArtifact, A2AMessage, A2ATask, TaskState } from './types.js';

const logger = getLogger('a2a:task-manager');

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  submitted: ['working', 'canceled'],
  working: ['completed', 'failed', 'input-required', 'canceled'],
  'input-required': ['working', 'canceled'],
  completed: ['canceled'],
  failed: ['canceled'],
  canceled: [],
};

export class TaskManager {
  private tasks = new Map<string, A2ATask>();

  createTask(initialMessage: A2AMessage): A2ATask {
    const now = Date.now();
    const task: A2ATask = {
      id: randomUUID(),
      state: 'submitted',
      messages: [initialMessage],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    logger.info(`Task created: ${task.id}`);
    return task;
  }

  getTask(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  updateState(id: string, state: TaskState): void {
    const task = this.tasks.get(id);
    if (!task) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Task not found: ${id}`,
        retryable: false,
      });
    }

    const allowed = VALID_TRANSITIONS[task.state];
    if (!allowed.includes(state)) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Invalid state transition: ${task.state} -> ${state}`,
        retryable: false,
      });
    }

    task.state = state;
    task.updatedAt = Date.now();
    logger.info(`Task ${id} state: ${state}`);
  }

  addMessage(taskId: string, message: A2AMessage): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Task not found: ${taskId}`,
        retryable: false,
      });
    }

    task.messages.push(message);
    task.updatedAt = Date.now();
  }

  addArtifact(taskId: string, artifact: Omit<A2AArtifact, 'id' | 'createdAt'>): A2AArtifact {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AuxioraError({
        code: ErrorCode.INVALID_INPUT,
        message: `Task not found: ${taskId}`,
        retryable: false,
      });
    }

    const full: A2AArtifact = {
      ...artifact,
      id: randomUUID(),
      createdAt: Date.now(),
    };

    task.artifacts.push(full);
    task.updatedAt = Date.now();
    return full;
  }

  listTasks(state?: TaskState): A2ATask[] {
    const all = Array.from(this.tasks.values());
    if (state) {
      return all.filter((t) => t.state === state);
    }
    return all;
  }

  cancelTask(id: string): void {
    this.updateState(id, 'canceled');
  }
}
