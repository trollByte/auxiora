import { describe, it, expect, beforeEach } from 'vitest';
import { RoleManager } from '../src/role-manager.js';
import { UserManager } from '../src/user-manager.js';
import { AccessControl } from '../src/access-control.js';

describe('AccessControl', () => {
  let roleManager: RoleManager;
  let userManager: UserManager;
  let ac: AccessControl;

  beforeEach(() => {
    roleManager = new RoleManager();
    userManager = new UserManager();
    ac = new AccessControl(roleManager, userManager);
  });

  describe('checkAccess', () => {
    it('should allow admin users via wildcard', () => {
      const user = userManager.createUser('admin@example.com', 'Admin', ['admin']);
      const result = ac.checkAccess(user.id, 'settings:manage');
      expect(result.allowed).toBe(true);
      expect(result.matchedRole).toBe('Admin');
      expect(result.reason).toContain('wildcard');
    });

    it('should allow user with direct permission', () => {
      const user = userManager.createUser('normal@example.com', 'Normal', ['user']);
      const result = ac.checkAccess(user.id, 'chat');
      expect(result.allowed).toBe(true);
      expect(result.matchedRole).toBe('User');
    });

    it('should deny user without permission', () => {
      const user = userManager.createUser('normal@example.com', 'Normal', ['user']);
      const result = ac.checkAccess(user.id, 'users:manage');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No role grants');
    });

    it('should deny inactive users', () => {
      const user = userManager.createUser('inactive@example.com', 'Inactive', ['admin']);
      userManager.updateUser(user.id, { isActive: false });
      const result = ac.checkAccess(user.id, 'chat');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('inactive');
    });

    it('should return not found for unknown user', () => {
      const result = ac.checkAccess('nonexistent', 'chat');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should skip unknown role ids gracefully', () => {
      const user = userManager.createUser('bad-role@example.com', 'BadRole', ['nonexistent-role']);
      const result = ac.checkAccess(user.id, 'chat');
      expect(result.allowed).toBe(false);
    });
  });

  describe('permission hierarchy', () => {
    it('should imply tools:use from tools:manage', () => {
      const role = roleManager.createRole('ToolAdmin', 'Manages tools', ['tools:manage']);
      const user = userManager.createUser('tooladmin@example.com', 'ToolAdmin', [role.id]);
      expect(ac.hasPermission(user.id, 'tools:use')).toBe(true);
    });

    it('should imply behaviors:view from behaviors:manage', () => {
      const role = roleManager.createRole('BehaviorAdmin', 'Manages behaviors', ['behaviors:manage']);
      const user = userManager.createUser('ba@example.com', 'BA', [role.id]);
      expect(ac.hasPermission(user.id, 'behaviors:view')).toBe(true);
    });

    it('should imply connectors:view from connectors:manage', () => {
      const role = roleManager.createRole('ConnAdmin', 'Manages connectors', ['connectors:manage']);
      const user = userManager.createUser('ca@example.com', 'CA', [role.id]);
      expect(ac.hasPermission(user.id, 'connectors:view')).toBe(true);
    });

    it('should imply settings:view from settings:manage', () => {
      const role = roleManager.createRole('SettingsAdmin', 'Manages settings', ['settings:manage']);
      const user = userManager.createUser('sa@example.com', 'SA', [role.id]);
      expect(ac.hasPermission(user.id, 'settings:view')).toBe(true);
    });

    it('should imply users:view from users:manage', () => {
      const role = roleManager.createRole('UserAdmin', 'Manages users', ['users:manage']);
      const user = userManager.createUser('ua@example.com', 'UA', [role.id]);
      expect(ac.hasPermission(user.id, 'users:view')).toBe(true);
    });

    it('should imply mcp:use from mcp:manage', () => {
      const role = roleManager.createRole('McpAdmin', 'Manages MCP', ['mcp:manage']);
      const user = userManager.createUser('ma@example.com', 'MA', [role.id]);
      expect(ac.hasPermission(user.id, 'mcp:use')).toBe(true);
    });

    it('should NOT imply manage from use/view', () => {
      const user = userManager.createUser('basic@example.com', 'Basic', ['user']);
      expect(ac.hasPermission(user.id, 'tools:manage')).toBe(false);
      expect(ac.hasPermission(user.id, 'behaviors:manage')).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return all effective permissions from all roles', () => {
      const user = userManager.createUser('multi@example.com', 'Multi', ['user', 'operator']);
      const perms = ac.getUserPermissions(user.id);
      expect(perms).toContain('chat');
      expect(perms).toContain('audit:view');
      expect(perms).toContain('behaviors:manage');
      // Implied permissions from hierarchy
      expect(perms).toContain('behaviors:view');
    });

    it('should return empty array for unknown user', () => {
      expect(ac.getUserPermissions('nonexistent')).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('should return true when allowed', () => {
      const user = userManager.createUser('has@example.com', 'Has', ['user']);
      expect(ac.hasPermission(user.id, 'chat')).toBe(true);
    });

    it('should return false when denied', () => {
      const user = userManager.createUser('no@example.com', 'No', ['viewer']);
      expect(ac.hasPermission(user.id, 'users:manage')).toBe(false);
    });
  });

  describe('enforceAccess', () => {
    it('should not throw when allowed', () => {
      const user = userManager.createUser('ok@example.com', 'OK', ['admin']);
      expect(() => ac.enforceAccess(user.id, 'settings:manage')).not.toThrow();
    });

    it('should throw when denied', () => {
      const user = userManager.createUser('denied@example.com', 'Denied', ['viewer']);
      expect(() => ac.enforceAccess(user.id, 'users:manage')).toThrow('Access denied');
    });
  });
});
