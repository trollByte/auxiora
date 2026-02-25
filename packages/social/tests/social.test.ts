import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { UserManager } from '../src/user-manager.js';
import { RoleManager } from '../src/role-manager.js';
import { UserResolver } from '../src/user-resolver.js';
import { BUILT_IN_ROLES } from '../src/types.js';

describe('UserManager', () => {
  let tmpDir: string;
  let manager: UserManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'));
    manager = new UserManager({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create a user', async () => {
    const user = await manager.createUser('Alice', 'admin');
    expect(user.id).toMatch(/^user-/);
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('admin');
    expect(user.memoryPartition).toContain('private:');
  });

  it('should get user by id', async () => {
    const created = await manager.createUser('Bob', 'member');
    const found = await manager.getUser(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Bob');
  });

  it('should get user by name', async () => {
    await manager.createUser('Charlie', 'viewer');
    const found = await manager.getUserByName('Charlie');
    expect(found).toBeDefined();
    expect(found!.role).toBe('viewer');
  });

  it('should update a user', async () => {
    const user = await manager.createUser('Dave', 'viewer');
    const updated = await manager.updateUser(user.id, { role: 'admin', name: 'David' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('David');
    expect(updated!.role).toBe('admin');
  });

  it('should return undefined for updating non-existent user', async () => {
    const result = await manager.updateUser('nonexistent', { name: 'Test' });
    expect(result).toBeUndefined();
  });

  it('should delete a user', async () => {
    const user = await manager.createUser('Eve', 'member');
    const deleted = await manager.deleteUser(user.id);
    expect(deleted).toBe(true);

    const found = await manager.getUser(user.id);
    expect(found).toBeUndefined();
  });

  it('should return false when deleting non-existent user', async () => {
    const deleted = await manager.deleteUser('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should list all users', async () => {
    await manager.createUser('User1', 'admin');
    await manager.createUser('User2', 'member');
    const users = await manager.listUsers();
    expect(users).toHaveLength(2);
  });

  it('should authenticate user by channel', async () => {
    await manager.createUser('Frank', 'member', {
      channels: [{ channelType: 'discord', senderId: 'frank#1234' }],
    });

    const found = await manager.authenticateUser('discord', 'frank#1234');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Frank');
  });

  it('should return undefined for unknown channel sender', async () => {
    const found = await manager.authenticateUser('discord', 'unknown');
    expect(found).toBeUndefined();
  });

  it('should switch user for a channel', async () => {
    const user1 = await manager.createUser('Grace', 'member', {
      channels: [{ channelType: 'web', senderId: 'session1' }],
    });
    const user2 = await manager.createUser('Heidi', 'member');

    const switched = await manager.switchUser(user2.id, 'web', 'session1');
    expect(switched).toBeDefined();
    expect(switched!.name).toBe('Heidi');

    // user1 should no longer have the channel mapping
    const u1 = await manager.getUser(user1.id);
    expect(u1!.channels).toHaveLength(0);
  });
});

describe('RoleManager', () => {
  let tmpDir: string;
  let userManager: UserManager;
  let roleManager: RoleManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-roles-'));
    userManager = new UserManager({ dir: tmpDir });
    roleManager = new RoleManager(userManager, { dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should list built-in roles', async () => {
    const roles = await roleManager.listRoles();
    expect(roles.length).toBeGreaterThanOrEqual(3);
    expect(roles.find(r => r.id === 'admin')).toBeDefined();
    expect(roles.find(r => r.id === 'member')).toBeDefined();
    expect(roles.find(r => r.id === 'viewer')).toBeDefined();
  });

  it('should get built-in role by id', async () => {
    const admin = await roleManager.getRole('admin');
    expect(admin).toBeDefined();
    expect(admin!.permissions).toContain('admin');
    expect(admin!.builtIn).toBe(true);
  });

  it('should create a custom role', async () => {
    const role = await roleManager.createRole('moderator', ['memory:read', 'memory:write', 'users:read']);
    expect(role.id).toMatch(/^role-/);
    expect(role.name).toBe('moderator');
    expect(role.builtIn).toBe(false);
  });

  it('should reject duplicate role names', async () => {
    await roleManager.createRole('custom1', ['memory:read']);
    await expect(roleManager.createRole('custom1', ['memory:write'])).rejects.toThrow('Role already exists');
  });

  it('should delete custom role', async () => {
    const role = await roleManager.createRole('temp', ['memory:read']);
    const deleted = await roleManager.deleteRole(role.id);
    expect(deleted).toBe(true);
  });

  it('should not delete built-in role', async () => {
    await expect(roleManager.deleteRole('admin')).rejects.toThrow('Cannot delete built-in role');
  });

  it('should assign role to user', async () => {
    const user = await userManager.createUser('Ivy', 'viewer');
    const assigned = await roleManager.assignRole(user.id, 'member');
    expect(assigned).toBe(true);

    const updated = await userManager.getUser(user.id);
    expect(updated!.role).toBe('member');
  });

  it('should check permissions correctly', async () => {
    const user = await userManager.createUser('Jack', 'member');

    const canRead = await roleManager.checkPermission(user.id, 'memory:read');
    expect(canRead).toBe(true);

    const canManagePlugins = await roleManager.checkPermission(user.id, 'plugins:manage');
    expect(canManagePlugins).toBe(false);
  });

  it('should grant all permissions to admin', async () => {
    const user = await userManager.createUser('Admin', 'admin');
    const canDoAnything = await roleManager.checkPermission(user.id, 'plugins:manage');
    expect(canDoAnything).toBe(true);
  });

  it('should return false for unknown user', async () => {
    const result = await roleManager.checkPermission('nonexistent', 'memory:read');
    expect(result).toBe(false);
  });
});

describe('UserResolver', () => {
  let tmpDir: string;
  let userManager: UserManager;
  let resolver: UserResolver;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-resolver-'));
    userManager = new UserManager({ dir: tmpDir });
    resolver = new UserResolver(userManager);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should resolve known user by channel', async () => {
    await userManager.createUser('Kate', 'member', {
      channels: [{ channelType: 'telegram', senderId: '12345' }],
    });

    const resolved = await resolver.resolveUser('telegram', '12345');
    expect(resolved).toBeDefined();
    expect(resolved!.name).toBe('Kate');
  });

  it('should return undefined for unknown sender', async () => {
    const resolved = await resolver.resolveUser('discord', 'unknown');
    expect(resolved).toBeUndefined();
  });

  it('should resolve or create auto-creates user', async () => {
    const user = await resolver.resolveOrCreate('slack', 'U123', 'SlackUser');
    expect(user.name).toBe('SlackUser');
    expect(user.role).toBe('viewer');
    expect(user.channels).toHaveLength(1);
    expect(user.channels[0].channelType).toBe('slack');
  });

  it('should resolve or create returns existing user', async () => {
    await userManager.createUser('Existing', 'admin', {
      channels: [{ channelType: 'web', senderId: 'sess1' }],
    });

    const user = await resolver.resolveOrCreate('web', 'sess1', 'NewName');
    expect(user.name).toBe('Existing');
    expect(user.role).toBe('admin');
  });

  it('should map channel to user', async () => {
    const user = await userManager.createUser('Leo', 'member');
    const mapped = await resolver.mapChannel(user.id, 'discord', 'leo#5678');
    expect(mapped).toBe(true);

    const resolved = await resolver.resolveUser('discord', 'leo#5678');
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe(user.id);
  });

  it('should unmap channel from user', async () => {
    const user = await userManager.createUser('Mia', 'member', {
      channels: [{ channelType: 'web', senderId: 'sess2' }],
    });

    const unmapped = await resolver.unmapChannel(user.id, 'web', 'sess2');
    expect(unmapped).toBe(true);

    const resolved = await resolver.resolveUser('web', 'sess2');
    expect(resolved).toBeUndefined();
  });
});
