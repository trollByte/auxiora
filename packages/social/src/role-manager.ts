import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import { audit } from '@auxiora/audit';
import { getAuxioraDir } from '@auxiora/core';
import type { Role, PermissionScope } from './types.js';
import { BUILT_IN_ROLES } from './types.js';
import type { UserManager } from './user-manager.js';

const logger = getLogger('social:role-manager');

export class RoleManager {
  private filePath: string;
  private userManager: UserManager;

  constructor(userManager: UserManager, options?: { dir?: string }) {
    const dir = options?.dir ?? path.join(getAuxioraDir(), 'social');
    this.filePath = path.join(dir, 'roles.json');
    this.userManager = userManager;
  }

  async createRole(name: string, permissions: PermissionScope[]): Promise<Role> {
    const roles = await this.readFile();

    if (roles.some(r => r.name === name)) {
      throw new Error(`Role already exists: ${name}`);
    }

    const role: Role = {
      id: `role-${crypto.randomUUID().slice(0, 8)}`,
      name,
      permissions,
      builtIn: false,
      createdAt: Date.now(),
    };

    roles.push(role);
    await this.writeFile(roles);
    void audit('social.role_created', { id: role.id, name });
    logger.debug('Created role', { id: role.id, name });
    return role;
  }

  async getRole(id: string): Promise<Role | undefined> {
    const builtIn = BUILT_IN_ROLES.find(r => r.id === id);
    if (builtIn) return builtIn;

    const roles = await this.readFile();
    return roles.find(r => r.id === id);
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const builtIn = BUILT_IN_ROLES.find(r => r.name === name || r.id === name);
    if (builtIn) return builtIn;

    const roles = await this.readFile();
    return roles.find(r => r.name === name);
  }

  async listRoles(): Promise<Role[]> {
    const custom = await this.readFile();
    return [...BUILT_IN_ROLES, ...custom];
  }

  async deleteRole(id: string): Promise<boolean> {
    const builtIn = BUILT_IN_ROLES.find(r => r.id === id);
    if (builtIn) {
      throw new Error('Cannot delete built-in role');
    }

    const roles = await this.readFile();
    const filtered = roles.filter(r => r.id !== id);
    if (filtered.length === roles.length) return false;

    await this.writeFile(filtered);
    void audit('social.role_deleted', { id });
    logger.debug('Deleted role', { id });
    return true;
  }

  async assignRole(userId: string, roleId: string): Promise<boolean> {
    const role = await this.getRole(roleId);
    if (!role) return false;

    const user = await this.userManager.updateUser(userId, { role: roleId });
    if (!user) return false;

    void audit('social.role_assigned', { userId, roleId });
    return true;
  }

  async checkPermission(userId: string, scope: PermissionScope): Promise<boolean> {
    const user = await this.userManager.getUser(userId);
    if (!user) return false;

    const role = await this.getRole(user.role);
    if (!role) return false;

    // Admin role has all permissions
    if (role.permissions.includes('admin')) return true;

    return role.permissions.includes(scope);
  }

  private async readFile(): Promise<Role[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as Role[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFile(roles: Role[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(roles, null, 2), 'utf-8');
  }
}
