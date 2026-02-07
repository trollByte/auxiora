import { getLogger } from '@auxiora/logger';

const logger = getLogger('marketplace:resolver');

export interface DependencyNode {
  name: string;
  version: string;
  dependencies: string[];
}

export interface ResolvedTree {
  order: string[];
  nodes: Map<string, DependencyNode>;
}

export class DependencyResolver {
  private registry: Map<string, DependencyNode> = new Map();

  addNode(node: DependencyNode): void {
    this.registry.set(node.name, node);
  }

  resolve(rootName: string): ResolvedTree {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const order: string[] = [];
    const nodes = new Map<string, DependencyNode>();

    this.visit(rootName, visited, inStack, order, nodes);

    return { order, nodes };
  }

  private visit(
    name: string,
    visited: Set<string>,
    inStack: Set<string>,
    order: string[],
    nodes: Map<string, DependencyNode>,
  ): void {
    if (visited.has(name)) return;

    if (inStack.has(name)) {
      throw new CircularDependencyError(name, Array.from(inStack));
    }

    const node = this.registry.get(name);
    if (!node) {
      throw new MissingDependencyError(name);
    }

    inStack.add(name);

    for (const dep of node.dependencies) {
      this.visit(dep, visited, inStack, order, nodes);
    }

    inStack.delete(name);
    visited.add(name);
    order.push(name);
    nodes.set(name, node);
  }

  detectCircular(names: string[]): string[][] {
    const cycles: string[][] = [];

    for (const name of names) {
      try {
        this.resolve(name);
      } catch (error) {
        if (error instanceof CircularDependencyError) {
          cycles.push(error.chain);
        }
      }
    }

    return cycles;
  }

  getInstallOrder(names: string[]): string[] {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const order: string[] = [];
    const nodes = new Map<string, DependencyNode>();

    for (const name of names) {
      this.visit(name, visited, inStack, order, nodes);
    }

    return order;
  }
}

export class CircularDependencyError extends Error {
  chain: string[];

  constructor(name: string, chain: string[]) {
    const chainStr = [...chain, name].join(' -> ');
    super(`Circular dependency detected: ${chainStr}`);
    this.name = 'CircularDependencyError';
    this.chain = [...chain, name];
  }
}

export class MissingDependencyError extends Error {
  dependencyName: string;

  constructor(name: string) {
    super(`Missing dependency: ${name}`);
    this.name = 'MissingDependencyError';
    this.dependencyName = name;
  }
}
