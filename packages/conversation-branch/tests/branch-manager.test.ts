import { describe, it, expect, beforeEach } from 'vitest';
import { BranchManager } from '../src/branch-manager.js';

describe('BranchManager', () => {
  let manager: BranchManager;

  beforeEach(() => {
    manager = new BranchManager('test-conversation');
  });

  describe('constructor', () => {
    it('creates a tree with a root branch', () => {
      const tree = manager.getTree();
      expect(tree.id).toBe('test-conversation');
      expect(tree.branches.size).toBe(1);
      expect(tree.rootBranchId).toBe(tree.activeBranchId);
    });

    it('generates an ID when none provided', () => {
      const m = new BranchManager();
      expect(m.getTree().id).toBeTruthy();
    });
  });

  describe('addMessage', () => {
    it('adds a message to the active branch', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      expect(msg.id).toBeTruthy();
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('preserves metadata', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hi', metadata: { key: 'value' } });
      expect(msg.metadata).toEqual({ key: 'value' });
    });

    it('appends messages in order', () => {
      manager.addMessage({ role: 'user', content: 'First' });
      manager.addMessage({ role: 'assistant', content: 'Second' });
      const messages = manager.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });
  });

  describe('fork', () => {
    it('creates a new branch from a message', () => {
      const msg1 = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi there' });

      const forked = manager.fork(msg1.id, 'alternative');
      expect(forked.label).toBe('alternative');
      expect(forked.parentBranchId).toBeTruthy();
      expect(forked.forkMessageId).toBe(msg1.id);
      expect(forked.messages).toHaveLength(1);
      expect(forked.messages[0].content).toBe('Hello');
    });

    it('sets the new branch as active', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);
      expect(manager.getActiveBranch().id).toBe(forked.id);
      expect(forked.isActive).toBe(true);
    });

    it('records a branch point', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);
      const points = manager.getBranchPoints();
      expect(points).toHaveLength(1);
      expect(points[0].messageId).toBe(msg.id);
      expect(points[0].branchIds).toContain(forked.id);
    });

    it('appends to existing branch point on multiple forks', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const rootId = manager.getTree().rootBranchId;

      manager.fork(msg.id, 'branch-a');
      manager.switchBranch(rootId);
      manager.fork(msg.id, 'branch-b');

      const points = manager.getBranchPoints();
      expect(points).toHaveLength(1);
      expect(points[0].branchIds).toHaveLength(2);
    });

    it('throws when message not found', () => {
      expect(() => manager.fork('nonexistent')).toThrow('Message nonexistent not found');
    });

    it('copies messages up to and including the fork message', () => {
      manager.addMessage({ role: 'user', content: 'First' });
      const msg2 = manager.addMessage({ role: 'assistant', content: 'Second' });
      manager.addMessage({ role: 'user', content: 'Third' });

      const forked = manager.fork(msg2.id);
      expect(forked.messages).toHaveLength(2);
      expect(forked.messages[0].content).toBe('First');
      expect(forked.messages[1].content).toBe('Second');
    });
  });

  describe('switchBranch', () => {
    it('switches to the specified branch', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const rootId = manager.getTree().rootBranchId;
      manager.fork(msg.id);

      const result = manager.switchBranch(rootId);
      expect(result.id).toBe(rootId);
      expect(manager.getActiveBranch().id).toBe(rootId);
    });

    it('deactivates the previous branch', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);

      manager.switchBranch(manager.getTree().rootBranchId);
      const forkedBranch = manager.getBranch(forked.id);
      expect(forkedBranch?.isActive).toBe(false);
    });

    it('throws when branch not found', () => {
      expect(() => manager.switchBranch('nonexistent')).toThrow('Branch nonexistent not found');
    });
  });

  describe('listBranches', () => {
    it('lists all branches', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.fork(msg.id, 'fork-1');
      expect(manager.listBranches()).toHaveLength(2);
    });
  });

  describe('deleteBranch', () => {
    it('deletes a non-root branch', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);
      manager.switchBranch(manager.getTree().rootBranchId);

      manager.deleteBranch(forked.id);
      expect(manager.getBranch(forked.id)).toBeUndefined();
      expect(manager.listBranches()).toHaveLength(1);
    });

    it('throws when deleting root branch', () => {
      expect(() => manager.deleteBranch(manager.getTree().rootBranchId)).toThrow('Cannot delete root branch');
    });

    it('throws when branch not found', () => {
      expect(() => manager.deleteBranch('nonexistent')).toThrow('Branch nonexistent not found');
    });

    it('switches to root when active branch is deleted', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);
      expect(manager.getActiveBranch().id).toBe(forked.id);

      manager.deleteBranch(forked.id);
      expect(manager.getActiveBranch().id).toBe(manager.getTree().rootBranchId);
    });

    it('removes branch from branch points', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      const forked = manager.fork(msg.id);
      expect(manager.getBranchPoints()).toHaveLength(1);

      manager.deleteBranch(forked.id);
      // Branch point should be removed since it has no branches left
      expect(manager.getBranchPoints()).toHaveLength(0);
    });
  });

  describe('mergeBranch', () => {
    it('appends messages after fork point to target', () => {
      const msg1 = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi' });
      const rootId = manager.getTree().rootBranchId;

      const forked = manager.fork(msg1.id);
      manager.addMessage({ role: 'user', content: 'Alternative question' });
      manager.addMessage({ role: 'assistant', content: 'Alternative answer' });

      manager.mergeBranch(forked.id, rootId);

      const target = manager.getBranch(rootId)!;
      // Original 2 messages + 2 merged after fork
      expect(target.messages).toHaveLength(4);
      expect(target.messages[2].content).toBe('Alternative question');
      expect(target.messages[3].content).toBe('Alternative answer');
    });

    it('throws when source branch not found', () => {
      expect(() => manager.mergeBranch('nonexistent', manager.getTree().rootBranchId)).toThrow(
        'Source branch nonexistent not found',
      );
    });

    it('throws when target branch not found', () => {
      expect(() => manager.mergeBranch(manager.getTree().rootBranchId, 'nonexistent')).toThrow(
        'Target branch nonexistent not found',
      );
    });
  });

  describe('serialization', () => {
    it('round-trips through JSON', () => {
      const msg1 = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi there' });
      manager.fork(msg1.id, 'test-fork');
      manager.addMessage({ role: 'user', content: 'Forked message' });

      const json = manager.toJSON();
      const restored = BranchManager.fromJSON(json);

      expect(restored.getTree().id).toBe('test-conversation');
      expect(restored.listBranches()).toHaveLength(2);
      expect(restored.getActiveBranch().label).toBe('test-fork');
      expect(restored.getMessages()).toHaveLength(2);
      expect(restored.getBranchPoints()).toHaveLength(1);
    });

    it('throws on invalid JSON', () => {
      expect(() => BranchManager.fromJSON('not-json')).toThrow('Failed to deserialize BranchManager');
    });
  });

  describe('getMessages', () => {
    it('returns messages from the active branch', () => {
      manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi' });

      const messages = manager.getMessages();
      expect(messages).toHaveLength(2);
    });
  });
});
