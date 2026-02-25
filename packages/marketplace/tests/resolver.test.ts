import { describe, it, expect } from 'vitest';
import {
  DependencyResolver,
  CircularDependencyError,
  MissingDependencyError,
} from '../src/resolver.js';

describe('DependencyResolver', () => {
  it('should resolve a simple dependency tree', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['b'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: [] });

    const tree = resolver.resolve('a');

    expect(tree.order).toEqual(['b', 'a']);
    expect(tree.nodes.size).toBe(2);
  });

  it('should resolve a deep dependency chain', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['b'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: ['c'] });
    resolver.addNode({ name: 'c', version: '1.0.0', dependencies: [] });

    const tree = resolver.resolve('a');

    expect(tree.order).toEqual(['c', 'b', 'a']);
  });

  it('should handle diamond dependencies', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['b', 'c'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: ['d'] });
    resolver.addNode({ name: 'c', version: '1.0.0', dependencies: ['d'] });
    resolver.addNode({ name: 'd', version: '1.0.0', dependencies: [] });

    const tree = resolver.resolve('a');

    expect(tree.order).toContain('d');
    expect(tree.order.indexOf('d')).toBeLessThan(tree.order.indexOf('b'));
    expect(tree.order.indexOf('d')).toBeLessThan(tree.order.indexOf('c'));
    expect(tree.order.indexOf('b')).toBeLessThan(tree.order.indexOf('a'));
  });

  it('should detect circular dependencies', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['b'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: ['a'] });

    expect(() => resolver.resolve('a')).toThrow(CircularDependencyError);
  });

  it('should detect self-referencing dependency', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['a'] });

    expect(() => resolver.resolve('a')).toThrow(CircularDependencyError);
  });

  it('should throw for missing dependency', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['missing'] });

    expect(() => resolver.resolve('a')).toThrow(MissingDependencyError);
  });

  it('should throw for missing root', () => {
    const resolver = new DependencyResolver();

    expect(() => resolver.resolve('nonexistent')).toThrow(MissingDependencyError);
  });

  it('should resolve node with no dependencies', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'standalone', version: '1.0.0', dependencies: [] });

    const tree = resolver.resolve('standalone');

    expect(tree.order).toEqual(['standalone']);
  });

  it('should detect circular deps across multiple roots', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['b'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: ['c'] });
    resolver.addNode({ name: 'c', version: '1.0.0', dependencies: ['a'] });
    resolver.addNode({ name: 'd', version: '1.0.0', dependencies: [] });

    const cycles = resolver.detectCircular(['a', 'b', 'c', 'd']);

    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should compute install order for multiple plugins', () => {
    const resolver = new DependencyResolver();
    resolver.addNode({ name: 'a', version: '1.0.0', dependencies: ['c'] });
    resolver.addNode({ name: 'b', version: '1.0.0', dependencies: ['c'] });
    resolver.addNode({ name: 'c', version: '1.0.0', dependencies: [] });

    const order = resolver.getInstallOrder(['a', 'b']);

    expect(order).toContain('c');
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
  });
});
