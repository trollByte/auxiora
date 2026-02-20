import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { Branch, BranchPoint, ConversationTree, Message } from './types.js';

const logger = getLogger('conversation-branch:manager');

export class BranchManager {
  private tree: ConversationTree;

  constructor(conversationId?: string) {
    const id = conversationId ?? crypto.randomUUID();
    const now = Date.now();
    const rootBranchId = crypto.randomUUID();
    const rootBranch: Branch = {
      id: rootBranchId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    this.tree = {
      id,
      rootBranchId,
      branches: new Map([[rootBranchId, rootBranch]]),
      branchPoints: new Map(),
      activeBranchId: rootBranchId,
      createdAt: now,
    };

    logger.debug(`Created conversation tree ${id} with root branch ${rootBranchId}`);
  }

  addMessage(message: Omit<Message, 'id' | 'timestamp'>): Message {
    const branch = this.getActiveBranch();
    const msg: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    branch.messages.push(msg);
    branch.updatedAt = Date.now();
    logger.debug(`Added message ${msg.id} to branch ${branch.id}`);
    return msg;
  }

  fork(messageId: string, label?: string): Branch {
    const sourceBranch = this.findBranchContainingMessage(messageId);
    if (!sourceBranch) {
      throw new Error(`Message ${messageId} not found in any branch`);
    }

    const messageIndex = sourceBranch.messages.findIndex((m) => m.id === messageId);
    const copiedMessages = sourceBranch.messages.slice(0, messageIndex + 1).map((m) => ({ ...m }));

    const now = Date.now();
    const newBranchId = crypto.randomUUID();
    const newBranch: Branch = {
      id: newBranchId,
      parentBranchId: sourceBranch.id,
      forkMessageId: messageId,
      messages: copiedMessages,
      label,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // Record branch point
    const existing = this.tree.branchPoints.get(messageId);
    if (existing) {
      existing.branchIds.push(newBranchId);
    } else {
      this.tree.branchPoints.set(messageId, {
        messageId,
        branchIds: [newBranchId],
        createdAt: now,
      });
    }

    // Deactivate current active branch, activate new one
    const activeBranch = this.tree.branches.get(this.tree.activeBranchId);
    if (activeBranch) {
      activeBranch.isActive = false;
    }
    newBranch.isActive = true;
    this.tree.branches.set(newBranchId, newBranch);
    this.tree.activeBranchId = newBranchId;

    logger.debug(`Forked branch ${newBranchId} from message ${messageId} in branch ${sourceBranch.id}`);
    return newBranch;
  }

  switchBranch(branchId: string): Branch {
    const branch = this.tree.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    const activeBranch = this.tree.branches.get(this.tree.activeBranchId);
    if (activeBranch) {
      activeBranch.isActive = false;
    }

    branch.isActive = true;
    this.tree.activeBranchId = branchId;
    logger.debug(`Switched to branch ${branchId}`);
    return branch;
  }

  getActiveBranch(): Branch {
    const branch = this.tree.branches.get(this.tree.activeBranchId);
    if (!branch) {
      throw new Error('Active branch not found');
    }
    return branch;
  }

  getBranch(id: string): Branch | undefined {
    return this.tree.branches.get(id);
  }

  listBranches(): Branch[] {
    return Array.from(this.tree.branches.values());
  }

  getMessages(): Message[] {
    return this.getActiveBranch().messages;
  }

  getBranchPoints(): BranchPoint[] {
    return Array.from(this.tree.branchPoints.values());
  }

  deleteBranch(branchId: string): void {
    if (branchId === this.tree.rootBranchId) {
      throw new Error('Cannot delete root branch');
    }
    const branch = this.tree.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    // Remove from branch points
    for (const [key, bp] of this.tree.branchPoints) {
      bp.branchIds = bp.branchIds.filter((id) => id !== branchId);
      if (bp.branchIds.length === 0) {
        this.tree.branchPoints.delete(key);
      }
    }

    this.tree.branches.delete(branchId);

    // If deleted branch was active, switch to root
    if (this.tree.activeBranchId === branchId) {
      this.tree.activeBranchId = this.tree.rootBranchId;
      const rootBranch = this.tree.branches.get(this.tree.rootBranchId);
      if (rootBranch) {
        rootBranch.isActive = true;
      }
    }

    logger.debug(`Deleted branch ${branchId}`);
  }

  mergeBranch(sourceId: string, targetId: string): void {
    const source = this.tree.branches.get(sourceId);
    const target = this.tree.branches.get(targetId);
    if (!source) {
      throw new Error(`Source branch ${sourceId} not found`);
    }
    if (!target) {
      throw new Error(`Target branch ${targetId} not found`);
    }

    // Find messages after the fork point
    let messagesToAppend: Message[];
    if (source.forkMessageId) {
      const forkIndex = source.messages.findIndex((m) => m.id === source.forkMessageId);
      messagesToAppend = source.messages.slice(forkIndex + 1).map((m) => ({
        ...m,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }));
    } else {
      // No fork point, append all messages
      messagesToAppend = source.messages.map((m) => ({
        ...m,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }));
    }

    target.messages.push(...messagesToAppend);
    target.updatedAt = Date.now();
    logger.debug(`Merged ${messagesToAppend.length} messages from branch ${sourceId} to ${targetId}`);
  }

  getTree(): ConversationTree {
    return this.tree;
  }

  toJSON(): string {
    const serializable = {
      ...this.tree,
      branches: Array.from(this.tree.branches.entries()),
      branchPoints: Array.from(this.tree.branchPoints.entries()),
    };
    return JSON.stringify(serializable);
  }

  static fromJSON(json: string): BranchManager {
    try {
      const parsed = JSON.parse(json) as {
        id: string;
        rootBranchId: string;
        branches: [string, Branch][];
        branchPoints: [string, BranchPoint][];
        activeBranchId: string;
        createdAt: number;
      };

      const manager = new BranchManager(parsed.id);
      manager.tree = {
        id: parsed.id,
        rootBranchId: parsed.rootBranchId,
        branches: new Map(parsed.branches),
        branchPoints: new Map(parsed.branchPoints),
        activeBranchId: parsed.activeBranchId,
        createdAt: parsed.createdAt,
      };
      return manager;
    } catch (err: unknown) {
      const wrapped: Error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Failed to deserialize BranchManager: ${wrapped.message}`);
    }
  }

  private findBranchContainingMessage(messageId: string): Branch | undefined {
    for (const branch of this.tree.branches.values()) {
      if (branch.messages.some((m) => m.id === messageId)) {
        return branch;
      }
    }
    return undefined;
  }
}
