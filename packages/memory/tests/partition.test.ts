import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryPartitionManager } from '../src/partition.js';
import { MemoryStore } from '../src/store.js';
import { MemoryRetriever } from '../src/retriever.js';

describe('MemoryPartitionManager', () => {
  let tmpDir: string;
  let manager: MemoryPartitionManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-partition-'));
    manager = new MemoryPartitionManager({ dir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create a private partition', async () => {
    const partition = await manager.createPartition('Alice Private', 'private', {
      ownerId: 'user-alice',
    });
    expect(partition.id).toMatch(/^part-/);
    expect(partition.type).toBe('private');
    expect(partition.ownerId).toBe('user-alice');
  });

  it('should create a shared partition', async () => {
    const partition = await manager.createPartition('Team Shared', 'shared', {
      ownerId: 'user-alice',
      memberIds: ['user-bob', 'user-charlie'],
    });
    expect(partition.type).toBe('shared');
    expect(partition.memberIds).toContain('user-bob');
  });

  it('should always have implicit global partition', async () => {
    const global = await manager.getPartition('global');
    expect(global).toBeDefined();
    expect(global!.type).toBe('global');
  });

  it('should list partitions for a user', async () => {
    await manager.createPartition('Alice Private', 'private', { ownerId: 'user-alice' });
    await manager.createPartition('Bob Private', 'private', { ownerId: 'user-bob' });
    await manager.createPartition('Team', 'shared', {
      ownerId: 'user-alice',
      memberIds: ['user-bob'],
    });

    const alicePartitions = await manager.listPartitions('user-alice');
    // global + alice private + team (as owner)
    expect(alicePartitions.length).toBe(3);

    const bobPartitions = await manager.listPartitions('user-bob');
    // global + bob private + team (as member)
    expect(bobPartitions.length).toBe(3);
  });

  it('should check access correctly', async () => {
    const priv = await manager.createPartition('Alice Only', 'private', {
      ownerId: 'user-alice',
    });

    expect(await manager.hasAccess(priv.id, 'user-alice')).toBe(true);
    expect(await manager.hasAccess(priv.id, 'user-bob')).toBe(false);
    expect(await manager.hasAccess('global', 'user-bob')).toBe(true);
  });

  it('should delete partition', async () => {
    const partition = await manager.createPartition('Temp', 'private', {
      ownerId: 'user-alice',
    });
    const deleted = await manager.deletePartition(partition.id);
    expect(deleted).toBe(true);

    const found = await manager.getPartition(partition.id);
    expect(found).toBeUndefined();
  });

  it('should not delete global partition', async () => {
    const deleted = await manager.deletePartition('global');
    expect(deleted).toBe(false);
  });
});

describe('Memory Partition Isolation', () => {
  let tmpDir: string;
  let store: MemoryStore;
  let retriever: MemoryRetriever;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-isolation-'));
    store = new MemoryStore({ dir: tmpDir });
    retriever = new MemoryRetriever();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should tag memories with partitionId', async () => {
    const entry = await store.add('Alice likes cats', 'preference', 'extracted', {
      partitionId: 'alice-private',
      sourceUserId: 'user-alice',
    });

    expect(entry.partitionId).toBe('alice-private');
    expect(entry.sourceUserId).toBe('user-alice');
  });

  it('should default partition to global', async () => {
    const entry = await store.add('Shared fact', 'fact', 'explicit');
    expect(entry.partitionId).toBe('global');
  });

  it('should filter memories by partition', async () => {
    await store.add('Alice secret', 'fact', 'explicit', { partitionId: 'alice-private' });
    await store.add('Bob secret', 'fact', 'explicit', { partitionId: 'bob-private' });
    await store.add('Shared info', 'fact', 'explicit', { partitionId: 'global' });

    const aliceMemories = await store.getByPartition('alice-private');
    expect(aliceMemories).toHaveLength(1);
    expect(aliceMemories[0].content).toBe('Alice secret');

    const globalMemories = await store.getByPartition('global');
    expect(globalMemories).toHaveLength(1);
    expect(globalMemories[0].content).toBe('Shared info');
  });

  it('should get memories by multiple partitions', async () => {
    await store.add('Alice pref', 'preference', 'explicit', { partitionId: 'alice-private' });
    await store.add('Bob pref', 'preference', 'explicit', { partitionId: 'bob-private' });
    await store.add('Global pref', 'preference', 'explicit', { partitionId: 'global' });

    const aliceAccessible = await store.getByPartitions(['alice-private', 'global']);
    expect(aliceAccessible).toHaveLength(2);
  });

  it('should not leak private memories in retriever', async () => {
    await store.add('Alice coffee preference', 'preference', 'explicit', {
      partitionId: 'alice-private',
      importance: 0.9,
    });
    await store.add('Bob tea preference', 'preference', 'explicit', {
      partitionId: 'bob-private',
      importance: 0.9,
    });
    await store.add('Global coffee facts', 'fact', 'explicit', {
      partitionId: 'global',
      importance: 0.9,
    });

    const allMemories = await store.getAll();

    // Bob should not see Alice's private memories
    const bobResult = retriever.retrieve(allMemories, 'coffee', ['bob-private', 'global']);
    expect(bobResult).not.toContain('Alice coffee');

    // Alice should see her own + global
    const aliceResult = retriever.retrieve(allMemories, 'coffee', ['alice-private', 'global']);
    expect(aliceResult).toContain('Alice coffee');
    expect(aliceResult).toContain('Global coffee');
  });
});
