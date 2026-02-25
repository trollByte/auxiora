import { describe, it, expect, beforeEach } from 'vitest';
import { UserManager } from '../src/user-manager.js';

describe('UserManager', () => {
  let manager: UserManager;

  beforeEach(() => {
    manager = new UserManager();
  });

  describe('createUser', () => {
    it('should create a user with the given fields', () => {
      const user = manager.createUser('alice@example.com', 'Alice', ['user']);
      expect(user.id).toBeDefined();
      expect(user.email).toBe('alice@example.com');
      expect(user.displayName).toBe('Alice');
      expect(user.roleIds).toEqual(['user']);
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeGreaterThan(0);
      expect(user.lastLoginAt).toBeUndefined();
    });
  });

  describe('getUser', () => {
    it('should retrieve a created user', () => {
      const user = manager.createUser('bob@example.com', 'Bob', ['viewer']);
      expect(manager.getUser(user.id)).toEqual(user);
    });

    it('should return undefined for unknown id', () => {
      expect(manager.getUser('nonexistent')).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    it('should find a user by email', () => {
      const user = manager.createUser('carol@example.com', 'Carol', ['user']);
      expect(manager.getUserByEmail('carol@example.com')).toEqual(user);
    });

    it('should return undefined for unknown email', () => {
      expect(manager.getUserByEmail('nobody@example.com')).toBeUndefined();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', () => {
      const user = manager.createUser('dan@example.com', 'Dan', ['user']);
      const updated = manager.updateUser(user.id, { displayName: 'Daniel', roleIds: ['admin'] });
      expect(updated.displayName).toBe('Daniel');
      expect(updated.roleIds).toEqual(['admin']);
    });

    it('should update isActive', () => {
      const user = manager.createUser('eve@example.com', 'Eve', ['user']);
      const updated = manager.updateUser(user.id, { isActive: false });
      expect(updated.isActive).toBe(false);
    });

    it('should update metadata', () => {
      const user = manager.createUser('frank@example.com', 'Frank', ['user']);
      const updated = manager.updateUser(user.id, { metadata: { team: 'eng' } });
      expect(updated.metadata).toEqual({ team: 'eng' });
    });

    it('should throw when user not found', () => {
      expect(() => manager.updateUser('fake', { displayName: 'x' })).toThrow('User not found');
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', () => {
      const user = manager.createUser('gone@example.com', 'Gone', ['user']);
      manager.deleteUser(user.id);
      expect(manager.getUser(user.id)).toBeUndefined();
    });

    it('should throw when user not found', () => {
      expect(() => manager.deleteUser('fake')).toThrow('User not found');
    });
  });

  describe('listUsers', () => {
    it('should return all users', () => {
      manager.createUser('a@example.com', 'A', ['user']);
      manager.createUser('b@example.com', 'B', ['viewer']);
      expect(manager.listUsers()).toHaveLength(2);
    });
  });

  describe('recordLogin', () => {
    it('should set lastLoginAt', () => {
      const user = manager.createUser('login@example.com', 'Login', ['user']);
      expect(user.lastLoginAt).toBeUndefined();
      manager.recordLogin(user.id);
      const updated = manager.getUser(user.id)!;
      expect(updated.lastLoginAt).toBeGreaterThan(0);
    });

    it('should throw when user not found', () => {
      expect(() => manager.recordLogin('fake')).toThrow('User not found');
    });
  });
});
