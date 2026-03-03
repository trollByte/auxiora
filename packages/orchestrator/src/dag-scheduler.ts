import type { AgentTask } from './types.js';

export interface DagWave {
  waveIndex: number;
  taskIds: string[];
}

export function validateDag(tasks: AgentTask[]): { valid: boolean; errors: string[] } {
  if (tasks.length === 0) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  // Check for missing dependency references
  for (const task of tasks) {
    if (!task.dependsOn) continue;
    for (const dep of task.dependsOn) {
      if (dep === task.id) {
        errors.push(`Task "${task.id}" has a self-referencing dependency`);
      } else if (!taskIds.has(dep)) {
        errors.push(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
    }
  }

  // Check for cycles using DFS
  const adjacency = new Map<string, string[]>();
  for (const task of tasks) {
    adjacency.set(task.id, []);
  }
  for (const task of tasks) {
    if (!task.dependsOn) continue;
    for (const dep of task.dependsOn) {
      if (taskIds.has(dep)) {
        adjacency.get(dep)!.push(task.id);
      }
    }
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of taskIds) {
    color.set(id, WHITE);
  }

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of adjacency.get(node) ?? []) {
      const c = color.get(neighbor)!;
      if (c === GRAY) {
        return true; // cycle found
      }
      if (c === WHITE && dfs(neighbor)) {
        return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const id of taskIds) {
    if (color.get(id) === WHITE) {
      if (dfs(id)) {
        errors.push('Cycle detected in task dependencies');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildWaves(tasks: AgentTask[]): DagWave[] {
  if (tasks.length === 0) {
    return [];
  }

  const taskIds = new Set(tasks.map((t) => t.id));

  // Build in-degree map
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    dependents.set(task.id, []);
  }

  for (const task of tasks) {
    if (!task.dependsOn) continue;
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        throw new Error(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      dependents.get(dep)!.push(task.id);
    }
  }

  const waves: DagWave[] = [];
  let queue = tasks.filter((t) => inDegree.get(t.id) === 0).map((t) => t.id);
  let placed = 0;

  while (queue.length > 0) {
    waves.push({ waveIndex: waves.length, taskIds: [...queue] });
    placed += queue.length;

    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const dep of dependents.get(id) ?? []) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) {
          nextQueue.push(dep);
        }
      }
    }
    queue = nextQueue;
  }

  if (placed < tasks.length) {
    throw new Error('Cycle detected in task dependencies — not all tasks could be scheduled');
  }

  return waves;
}
