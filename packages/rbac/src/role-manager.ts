import crypto from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { Permission, Role } from './types.js';

const logger = getLogger('rbac:role-manager');

const BUILT_IN_ROLES: Omit<Role, 'createdAt'>[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full system access',
    permissions: ['*'],
    isBuiltIn: true,
  },
  {
    id: 'user',
    name: 'User',
    description: 'Standard user with basic access',
    permissions: ['chat', 'tools:use', 'behaviors:view', 'connectors:view', 'settings:view', 'mcp:use'],
    isBuiltIn: true,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access',
    permissions: ['chat', 'behaviors:view', 'connectors:view', 'settings:view'],
    isBuiltIn: true,
  },
  {
    id: 'operator',
    name: 'Operator',
    description: 'Operational management access',
    permissions: [
      'chat', 'tools:use', 'behaviors:view', 'behaviors:manage',
      'connectors:view', 'connectors:manage', 'settings:view',
      'mcp:use', 'mcp:manage', 'audit:view',
    ],
    isBuiltIn: true,
  },
];

export class RoleManager {
  private roles: Map<string, Role> = new Map();

  constructor() {
    const now = Date.now();
    for (const role of BUILT_IN_ROLES) {
      this.roles.set(role.id, { ...role, createdAt: now });
    }
    logger.info(`Initialized with ${this.roles.size} built-in roles`);
  }

  createRole(name: string, description: string, permissions: Permission[]): Role {
    const role: Role = {
      id: crypto.randomUUID(),
      name,
      description,
      permissions,
      isBuiltIn: false,
      createdAt: Date.now(),
    };
    this.roles.set(role.id, role);
    logger.info(`Created role "${name}" (${role.id})`);
    return role;
  }

  getRole(id: string): Role | undefined {
    return this.roles.get(id);
  }

  updateRole(id: string, updates: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>): Role {
    const role = this.roles.get(id);
    if (!role) {
      throw new Error(`Role not found: ${id}`);
    }
    if (role.isBuiltIn) {
      throw new Error(`Cannot modify built-in role: ${role.name}`);
    }
    const updated = { ...role, ...updates };
    this.roles.set(id, updated);
    logger.info(`Updated role "${updated.name}" (${id})`);
    return updated;
  }

  deleteRole(id: string): void {
    const role = this.roles.get(id);
    if (!role) {
      throw new Error(`Role not found: ${id}`);
    }
    if (role.isBuiltIn) {
      throw new Error(`Cannot delete built-in role: ${role.name}`);
    }
    this.roles.delete(id);
    logger.info(`Deleted role "${role.name}" (${id})`);
  }

  listRoles(): Role[] {
    return [...this.roles.values()];
  }

  getRolePermissions(roleId: string): Permission[] {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    return [...role.permissions];
  }
}
