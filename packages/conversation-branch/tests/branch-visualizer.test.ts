import { describe, it, expect, beforeEach } from 'vitest';
import { BranchManager } from '../src/branch-manager.js';
import { BranchVisualizer } from '../src/branch-visualizer.js';

describe('BranchVisualizer', () => {
  let manager: BranchManager;
  let visualizer: BranchVisualizer;

  beforeEach(() => {
    manager = new BranchManager('test-viz');
    visualizer = new BranchVisualizer();
  });

  describe('toAsciiTree', () => {
    it('renders a single branch', () => {
      manager.addMessage({ role: 'user', content: 'Hello' });
      const output = visualizer.toAsciiTree(manager.getTree());
      expect(output).toContain('1 msgs');
      expect(output).toContain('*'); // active marker
    });

    it('renders forked branches', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi' });
      manager.fork(msg.id, 'alt-path');

      const output = visualizer.toAsciiTree(manager.getTree());
      expect(output).toContain('alt-path');
      expect(output).toContain('2 msgs'); // root branch
      expect(output).toContain('1 msgs'); // forked branch
    });

    it('marks the active branch', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.fork(msg.id, 'forked');
      const output = visualizer.toAsciiTree(manager.getTree());
      // The forked branch should be active (marked with *)
      const lines = output.split('\n');
      const forkedLine = lines.find((l) => l.includes('forked'));
      expect(forkedLine).toContain('*');
    });
  });

  describe('toMarkdown', () => {
    it('renders markdown with branch info', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.fork(msg.id, 'experiment');
      manager.addMessage({ role: 'user', content: 'New direction' });

      const md = visualizer.toMarkdown(manager.getTree());
      expect(md).toContain('# Conversation Branches');
      expect(md).toContain('experiment');
      expect(md).toContain('(active)');
      expect(md).toContain('root');
      expect(md).toContain('messages');
    });

    it('shows parent info for forked branches', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.fork(msg.id, 'child');
      const md = visualizer.toMarkdown(manager.getTree());
      expect(md).toContain('parent:');
    });
  });

  describe('getSummary', () => {
    it('returns correct stats for a single branch', () => {
      manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi' });

      const summary = visualizer.getSummary(manager.getTree());
      expect(summary.branchCount).toBe(1);
      expect(summary.messageCount).toBe(2);
      expect(summary.maxDepth).toBe(0);
      expect(summary.forkPoints).toBe(0);
    });

    it('returns correct stats with forks', () => {
      const msg = manager.addMessage({ role: 'user', content: 'Hello' });
      manager.addMessage({ role: 'assistant', content: 'Hi' });
      manager.fork(msg.id, 'fork-1');
      manager.addMessage({ role: 'user', content: 'Alt' });

      const summary = visualizer.getSummary(manager.getTree());
      expect(summary.branchCount).toBe(2);
      // Root: 2 msgs, Fork: 1 copied + 1 added = 2
      expect(summary.messageCount).toBe(4);
      expect(summary.maxDepth).toBe(1);
      expect(summary.forkPoints).toBe(1);
    });

    it('calculates depth for nested forks', () => {
      const msg1 = manager.addMessage({ role: 'user', content: 'Level 0' });
      manager.fork(msg1.id, 'level-1');
      const msg2 = manager.addMessage({ role: 'user', content: 'Level 1 msg' });
      manager.fork(msg2.id, 'level-2');

      const summary = visualizer.getSummary(manager.getTree());
      expect(summary.maxDepth).toBe(2);
      expect(summary.branchCount).toBe(3);
    });
  });
});
