import { describe, it, expect, beforeEach } from 'vitest';
import { RoleManager } from '../src/role-manager.js';

describe('RoleManager', () => {
  let manager: RoleManager;

  beforeEach(() => {
    manager = new RoleManager();
  });

  describe('built-in roles', () => {
    it('should seed admin, user, viewer, and operator roles', () => {
      const roles = manager.listRoles();
      expect(roles).toHaveLength(4);
      const names = roles.map((r) => r.id);
      expect(names).toContain('admin');
      expect(names).toContain('user');
      expect(names).toContain('viewer');
      expect(names).toContain('operator');
    });

    it('should give admin the wildcard permission', () => {
      const admin = manager.getRole('admin');
      expect(admin).toBeDefined();
      expect(admin!.permissions).toEqual(['*']);
      expect(admin!.isBuiltIn).toBe(true);
    });

    it('should give user standard permissions', () => {
      const user = manager.getRole('user');
      expect(user).toBeDefined();
      expect(user!.permissions).toContain('chat');
      expect(user!.permissions).toContain('tools:use');
      expect(user!.permissions).toContain('mcp:use');
    });

    it('should give viewer read-only permissions', () => {
      const viewer = manager.getRole('viewer');
      expect(viewer!.permissions).toEqual(['chat', 'behaviors:view', 'connectors:view', 'settings:view']);
    });

    it('should give operator management permissions', () => {
      const operator = manager.getRole('operator');
      expect(operator!.permissions).toContain('behaviors:manage');
      expect(operator!.permissions).toContain('connectors:manage');
      expect(operator!.permissions).toContain('mcp:manage');
      expect(operator!.permissions).toContain('audit:view');
    });
  });

  describe('createRole', () => {
    it('should create a custom role', () => {
      const role = manager.createRole('Tester', 'Testing role', ['chat', 'tools:use']);
      expect(role.id).toBeDefined();
      expect(role.name).toBe('Tester');
      expect(role.description).toBe('Testing role');
      expect(role.permissions).toEqual(['chat', 'tools:use']);
      expect(role.isBuiltIn).toBe(false);
      expect(role.createdAt).toBeGreaterThan(0);
    });

    it('should add the role to the list', () => {
      manager.createRole('Custom', 'A custom role', ['chat']);
      expect(manager.listRoles()).toHaveLength(5);
    });
  });

  describe('getRole', () => {
    it('should return undefined for unknown id', () => {
      expect(manager.getRole('nonexistent')).toBeUndefined();
    });
  });

  describe('updateRole', () => {
    it('should update a custom role', () => {
      const role = manager.createRole('Mutable', 'Will change', ['chat']);
      const updated = manager.updateRole(role.id, { name: 'Changed', permissions: ['chat', 'audit:view'] });
      expect(updated.name).toBe('Changed');
      expect(updated.permissions).toEqual(['chat', 'audit:view']);
    });

    it('should throw when updating a built-in role', () => {
      expect(() => manager.updateRole('admin', { name: 'Hacked' })).toThrow('Cannot modify built-in role');
    });

    it('should throw when role not found', () => {
      expect(() => manager.updateRole('fake', { name: 'x' })).toThrow('Role not found');
    });
  });

  describe('deleteRole', () => {
    it('should delete a custom role', () => {
      const role = manager.createRole('Temp', 'Temporary', ['chat']);
      manager.deleteRole(role.id);
      expect(manager.getRole(role.id)).toBeUndefined();
    });

    it('should throw when deleting a built-in role', () => {
      expect(() => manager.deleteRole('admin')).toThrow('Cannot delete built-in role');
    });

    it('should throw when role not found', () => {
      expect(() => manager.deleteRole('fake')).toThrow('Role not found');
    });
  });

  describe('getRolePermissions', () => {
    it('should return a copy of the permissions', () => {
      const perms = manager.getRolePermissions('user');
      expect(perms).toContain('chat');
      perms.push('*');
      expect(manager.getRolePermissions('user')).not.toContain('*');
    });

    it('should throw when role not found', () => {
      expect(() => manager.getRolePermissions('fake')).toThrow('Role not found');
    });
  });
});
