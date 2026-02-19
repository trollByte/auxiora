import { describe, it, expect, beforeEach } from 'vitest';
import { TaskManager } from '../src/task-manager.js';
import type { A2AMessage } from '../src/types.js';

function makeMessage(role: 'user' | 'agent' = 'user', text = 'hello'): A2AMessage {
  return {
    role,
    parts: [{ type: 'text', text }],
    timestamp: Date.now(),
  };
}

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('createTask', () => {
    it('creates a task with submitted state', () => {
      const task = manager.createTask(makeMessage());

      expect(task.id).toBeDefined();
      expect(task.state).toBe('submitted');
      expect(task.messages).toHaveLength(1);
      expect(task.artifacts).toEqual([]);
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.updatedAt).toBe(task.createdAt);
    });

    it('includes the initial message', () => {
      const msg = makeMessage('user', 'test message');
      const task = manager.createTask(msg);

      expect(task.messages[0].parts[0]).toEqual({ type: 'text', text: 'test message' });
    });
  });

  describe('getTask', () => {
    it('returns the task by id', () => {
      const task = manager.createTask(makeMessage());
      expect(manager.getTask(task.id)).toBe(task);
    });

    it('returns undefined for unknown id', () => {
      expect(manager.getTask('nonexistent')).toBeUndefined();
    });
  });

  describe('updateState', () => {
    it('transitions submitted -> working', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      expect(task.state).toBe('working');
    });

    it('transitions working -> completed', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      manager.updateState(task.id, 'completed');
      expect(task.state).toBe('completed');
    });

    it('transitions working -> failed', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      manager.updateState(task.id, 'failed');
      expect(task.state).toBe('failed');
    });

    it('transitions working -> input-required', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      manager.updateState(task.id, 'input-required');
      expect(task.state).toBe('input-required');
    });

    it('transitions input-required -> working', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      manager.updateState(task.id, 'input-required');
      manager.updateState(task.id, 'working');
      expect(task.state).toBe('working');
    });

    it('rejects invalid transitions', () => {
      const task = manager.createTask(makeMessage());
      expect(() => manager.updateState(task.id, 'completed')).toThrow(
        'Invalid state transition: submitted -> completed',
      );
    });

    it('rejects transition from canceled', () => {
      const task = manager.createTask(makeMessage());
      manager.cancelTask(task.id);
      expect(() => manager.updateState(task.id, 'working')).toThrow(
        'Invalid state transition: canceled -> working',
      );
    });

    it('throws for unknown task', () => {
      expect(() => manager.updateState('nope', 'working')).toThrow('Task not found: nope');
    });

    it('updates the updatedAt timestamp', () => {
      const task = manager.createTask(makeMessage());
      const before = task.updatedAt;
      manager.updateState(task.id, 'working');
      expect(task.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('addMessage', () => {
    it('appends a message to the task', () => {
      const task = manager.createTask(makeMessage());
      const reply = makeMessage('agent', 'response');
      manager.addMessage(task.id, reply);

      expect(task.messages).toHaveLength(2);
      expect(task.messages[1].role).toBe('agent');
    });

    it('throws for unknown task', () => {
      expect(() => manager.addMessage('nope', makeMessage())).toThrow('Task not found: nope');
    });
  });

  describe('addArtifact', () => {
    it('adds an artifact with generated id and timestamp', () => {
      const task = manager.createTask(makeMessage());
      const artifact = manager.addArtifact(task.id, {
        name: 'result.txt',
        parts: [{ type: 'text', text: 'output' }],
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.name).toBe('result.txt');
      expect(artifact.createdAt).toBeGreaterThan(0);
      expect(task.artifacts).toHaveLength(1);
    });

    it('throws for unknown task', () => {
      expect(() =>
        manager.addArtifact('nope', { name: 'x', parts: [] }),
      ).toThrow('Task not found: nope');
    });
  });

  describe('listTasks', () => {
    it('lists all tasks', () => {
      manager.createTask(makeMessage());
      manager.createTask(makeMessage());
      expect(manager.listTasks()).toHaveLength(2);
    });

    it('filters by state', () => {
      const t1 = manager.createTask(makeMessage());
      manager.createTask(makeMessage());
      manager.updateState(t1.id, 'working');

      expect(manager.listTasks('working')).toHaveLength(1);
      expect(manager.listTasks('submitted')).toHaveLength(1);
    });
  });

  describe('cancelTask', () => {
    it('cancels a submitted task', () => {
      const task = manager.createTask(makeMessage());
      manager.cancelTask(task.id);
      expect(task.state).toBe('canceled');
    });

    it('cancels a working task', () => {
      const task = manager.createTask(makeMessage());
      manager.updateState(task.id, 'working');
      manager.cancelTask(task.id);
      expect(task.state).toBe('canceled');
    });
  });
});
