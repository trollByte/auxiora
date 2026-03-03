import { describe, it, expect } from 'vitest';
import { validateDag, buildWaves } from '../src/dag-scheduler.js';
import type { AgentTask } from '../src/types.js';

function makeTask(id: string, dependsOn?: string[]): AgentTask {
  return {
    id,
    name: `Task ${id}`,
    provider: 'test',
    systemPrompt: 'You are a test agent.',
    userPrompt: 'Do something.',
    dependsOn,
  };
}

describe('validateDag', () => {
  it('returns valid for an empty task list', () => {
    const result = validateDag([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid for an acyclic graph', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing dependency references', () => {
    const tasks = [makeTask('A'), makeTask('B', ['X'])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown task "X"'))).toBe(true);
  });

  it('detects cycles (A->B->A)', () => {
    const tasks = [makeTask('A', ['B']), makeTask('B', ['A'])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Cycle'))).toBe(true);
  });

  it('detects self-referencing dependencies', () => {
    const tasks = [makeTask('A', ['A'])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('self-referencing'))).toBe(true);
  });

  it('validates a diamond DAG as valid', () => {
    const tasks = [
      makeTask('A'),
      makeTask('B', ['A']),
      makeTask('C', ['A']),
      makeTask('D', ['B', 'C']),
    ];
    const result = validateDag(tasks);
    expect(result.valid).toBe(true);
  });
});

describe('buildWaves', () => {
  it('returns empty array for no tasks', () => {
    expect(buildWaves([])).toEqual([]);
  });

  it('places a single task in wave 0', () => {
    const waves = buildWaves([makeTask('A')]);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toEqual({ waveIndex: 0, taskIds: ['A'] });
  });

  it('builds waves for a linear chain A->B->C', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
    const waves = buildWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].taskIds).toEqual(['A']);
    expect(waves[1].taskIds).toEqual(['B']);
    expect(waves[2].taskIds).toEqual(['C']);
  });

  it('builds waves for a diamond: A->{B,C}->D', () => {
    const tasks = [
      makeTask('A'),
      makeTask('B', ['A']),
      makeTask('C', ['A']),
      makeTask('D', ['B', 'C']),
    ];
    const waves = buildWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].taskIds).toEqual(['A']);
    expect(waves[1].taskIds.sort()).toEqual(['B', 'C']);
    expect(waves[2].taskIds).toEqual(['D']);
  });

  it('places all independent tasks in wave 0', () => {
    const tasks = [makeTask('A'), makeTask('B'), makeTask('C')];
    const waves = buildWaves(tasks);
    expect(waves).toHaveLength(1);
    expect(waves[0].taskIds.sort()).toEqual(['A', 'B', 'C']);
  });

  it('handles a complex graph with multiple roots', () => {
    // R1 -> A -> C
    // R2 -> B -> C
    const tasks = [
      makeTask('R1'),
      makeTask('R2'),
      makeTask('A', ['R1']),
      makeTask('B', ['R2']),
      makeTask('C', ['A', 'B']),
    ];
    const waves = buildWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].taskIds.sort()).toEqual(['R1', 'R2']);
    expect(waves[1].taskIds.sort()).toEqual(['A', 'B']);
    expect(waves[2].taskIds).toEqual(['C']);
  });

  it('throws on cycles', () => {
    const tasks = [makeTask('A', ['B']), makeTask('B', ['A'])];
    expect(() => buildWaves(tasks)).toThrow('Cycle');
  });

  it('treats tasks without dependsOn as roots', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C')];
    const waves = buildWaves(tasks);
    expect(waves[0].taskIds.sort()).toEqual(['A', 'C']);
    expect(waves[1].taskIds).toEqual(['B']);
  });

  it('assigns correct waveIndex values', () => {
    const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
    const waves = buildWaves(tasks);
    for (let i = 0; i < waves.length; i++) {
      expect(waves[i].waveIndex).toBe(i);
    }
  });

  it('throws on missing dependency in buildWaves', () => {
    const tasks = [makeTask('A', ['Z'])];
    expect(() => buildWaves(tasks)).toThrow('unknown task "Z"');
  });
});
