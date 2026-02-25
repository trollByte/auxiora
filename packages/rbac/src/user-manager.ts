import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { User } from './types.js';

const logger = getLogger('rbac:user-manager');

export class UserManager {
  private users: Map<string, User> = new Map();

  createUser(email: string, displayName: string, roleIds: string[]): User {
    const user: User = {
      id: crypto.randomUUID(),
      email,
      displayName,
      roleIds,
      isActive: true,
      createdAt: Date.now(),
    };
    this.users.set(user.id, user);
    logger.info(`Created user "${displayName}" (${user.id})`);
    return user;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  updateUser(id: string, updates: Partial<Pick<User, 'displayName' | 'roleIds' | 'isActive' | 'metadata'>>): User {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    logger.info(`Updated user "${updated.displayName}" (${id})`);
    return updated;
  }

  deleteUser(id: string): void {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    this.users.delete(id);
    logger.info(`Deleted user "${user.displayName}" (${id})`);
  }

  listUsers(): User[] {
    return [...this.users.values()];
  }

  recordLogin(id: string): void {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    user.lastLoginAt = Date.now();
    logger.info(`Recorded login for "${user.displayName}" (${id})`);
  }
}
