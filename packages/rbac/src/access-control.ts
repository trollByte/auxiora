import { getLogger } from '@auxiora/logger';
import type { RoleManager } from './role-manager.js';
import type { UserManager } from './user-manager.js';
import type { AccessCheckResult, Permission } from './types.js';

const logger = getLogger('rbac:access-control');

const PERMISSION_HIERARCHY: Record<string, string> = {
  'chat:admin': 'chat',
  'tools:manage': 'tools:use',
  'behaviors:manage': 'behaviors:view',
  'connectors:manage': 'connectors:view',
  'settings:manage': 'settings:view',
  'users:manage': 'users:view',
  'mcp:manage': 'mcp:use',
};

export class AccessControl {
  constructor(
    private roleManager: RoleManager,
    private userManager: UserManager,
  ) {}

  checkAccess(userId: string, permission: Permission): AccessCheckResult {
    const user = this.userManager.getUser(userId);
    if (!user) {
      return { allowed: false, reason: `User not found: ${userId}` };
    }
    if (!user.isActive) {
      return { allowed: false, reason: 'User account is inactive' };
    }

    for (const roleId of user.roleIds) {
      const role = this.roleManager.getRole(roleId);
      if (!role) {
        continue;
      }
      const perms = role.permissions;
      if (perms.includes('*')) {
        return { allowed: true, reason: `Granted by wildcard in role "${role.name}"`, matchedRole: role.name };
      }
      if (perms.includes(permission)) {
        return { allowed: true, reason: `Granted by role "${role.name}"`, matchedRole: role.name };
      }
      // Check hierarchy: if user has manage, they implicitly have view/use
      for (const perm of perms) {
        const implied = PERMISSION_HIERARCHY[perm];
        if (implied === permission) {
          return { allowed: true, reason: `Granted by "${perm}" implying "${permission}" in role "${role.name}"`, matchedRole: role.name };
        }
      }
    }

    return { allowed: false, reason: `No role grants "${permission}"` };
  }

  getUserPermissions(userId: string): Permission[] {
    const user = this.userManager.getUser(userId);
    if (!user) {
      return [];
    }

    const permissions = new Set<Permission>();
    for (const roleId of user.roleIds) {
      const role = this.roleManager.getRole(roleId);
      if (!role) {
        continue;
      }
      for (const perm of role.permissions) {
        permissions.add(perm);
        // Add implied permissions from hierarchy
        const implied = PERMISSION_HIERARCHY[perm];
        if (implied) {
          permissions.add(implied as Permission);
        }
      }
    }

    return [...permissions];
  }

  hasPermission(userId: string, permission: Permission): boolean {
    return this.checkAccess(userId, permission).allowed;
  }

  enforceAccess(userId: string, permission: Permission): void {
    const result = this.checkAccess(userId, permission);
    if (!result.allowed) {
      logger.warn(`Access denied for user ${userId}: ${result.reason}`);
      throw new Error(`Access denied: ${result.reason}`);
    }
  }
}
