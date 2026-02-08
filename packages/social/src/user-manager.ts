import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getAuxioraDir } from '@auxiora/core';
import type { UserIdentity, UserChannelMapping } from './types.js';

const logger = getLogger('social:user-manager');

export class UserManager {
  private filePath: string;

  constructor(options?: { dir?: string }) {
    const dir = options?.dir ?? path.join(getAuxioraDir(), 'social');
    this.filePath = path.join(dir, 'users.json');
  }

  async createUser(
    name: string,
    role: string,
    options?: {
      channels?: UserChannelMapping[];
      memoryPartition?: string;
      personalityRelationship?: string;
    },
  ): Promise<UserIdentity> {
    const users = await this.readFile();

    const id = `user-${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const user: UserIdentity = {
      id,
      name,
      role,
      channels: options?.channels ?? [],
      trustOverrides: {},
      memoryPartition: options?.memoryPartition ?? `private:${id}`,
      personalityRelationship: options?.personalityRelationship ?? 'default',
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };

    users.push(user);
    await this.writeFile(users);
    void audit('social.user_created', { id, name, role });
    logger.debug('Created user', { id, name });
    return user;
  }

  async getUser(id: string): Promise<UserIdentity | undefined> {
    const users = await this.readFile();
    return users.find(u => u.id === id);
  }

  async getUserByName(name: string): Promise<UserIdentity | undefined> {
    const users = await this.readFile();
    return users.find(u => u.name === name);
  }

  async updateUser(
    id: string,
    updates: Partial<Pick<UserIdentity, 'name' | 'role' | 'channels' | 'trustOverrides' | 'memoryPartition' | 'personalityRelationship'>>,
  ): Promise<UserIdentity | undefined> {
    const users = await this.readFile();
    const user = users.find(u => u.id === id);
    if (!user) return undefined;

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.channels !== undefined) user.channels = updates.channels;
    if (updates.trustOverrides !== undefined) user.trustOverrides = updates.trustOverrides;
    if (updates.memoryPartition !== undefined) user.memoryPartition = updates.memoryPartition;
    if (updates.personalityRelationship !== undefined) user.personalityRelationship = updates.personalityRelationship;
    user.updatedAt = Date.now();

    await this.writeFile(users);
    void audit('social.user_updated', { id, updates: Object.keys(updates) });
    logger.debug('Updated user', { id });
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const users = await this.readFile();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) return false;

    await this.writeFile(filtered);
    void audit('social.user_deleted', { id });
    logger.debug('Deleted user', { id });
    return true;
  }

  async listUsers(): Promise<UserIdentity[]> {
    return this.readFile();
  }

  async authenticateUser(channelType: string, senderId: string): Promise<UserIdentity | undefined> {
    const users = await this.readFile();
    const user = users.find(u =>
      u.channels.some(c => c.channelType === channelType && c.senderId === senderId),
    );

    if (user) {
      user.lastActiveAt = Date.now();
      await this.writeFile(users);
    }

    return user;
  }

  async switchUser(userId: string, channelType: string, senderId: string): Promise<UserIdentity | undefined> {
    const users = await this.readFile();
    const user = users.find(u => u.id === userId);
    if (!user) return undefined;

    // Remove this channel mapping from any other user
    for (const u of users) {
      u.channels = u.channels.filter(
        c => !(c.channelType === channelType && c.senderId === senderId),
      );
    }

    // Add mapping to the target user
    if (!user.channels.some(c => c.channelType === channelType && c.senderId === senderId)) {
      user.channels.push({ channelType, senderId });
    }
    user.lastActiveAt = Date.now();
    user.updatedAt = Date.now();

    await this.writeFile(users);
    void audit('social.user_switched', { userId, channelType, senderId });
    return user;
  }

  private async readFile(): Promise<UserIdentity[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as UserIdentity[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(users: UserIdentity[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(users, null, 2), 'utf-8');
  }
}
