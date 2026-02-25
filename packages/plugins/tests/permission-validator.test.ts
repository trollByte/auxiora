import { describe, it, expect } from 'vitest';
import {
  validatePermissions,
  isPermissionSubset,
  describePermission,
} from '../src/permission-validator.js';

describe('validatePermissions', () => {
  it('should validate all granted permissions', () => {
    const result = validatePermissions(
      ['NETWORK', 'FILESYSTEM'],
      ['NETWORK', 'FILESYSTEM', 'SHELL'],
    );

    expect(result.valid).toBe(true);
    expect(result.granted).toEqual(['NETWORK', 'FILESYSTEM']);
    expect(result.denied).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('should detect denied permissions', () => {
    const result = validatePermissions(
      ['NETWORK', 'SHELL'],
      ['NETWORK'],
    );

    expect(result.valid).toBe(false);
    expect(result.granted).toEqual(['NETWORK']);
    expect(result.denied).toEqual(['SHELL']);
  });

  it('should detect unknown permissions', () => {
    const result = validatePermissions(
      ['NETWORK', 'INVALID'],
      ['NETWORK'],
    );

    expect(result.valid).toBe(false);
    expect(result.unknown).toEqual(['INVALID']);
  });

  it('should handle empty requested', () => {
    const result = validatePermissions([], ['NETWORK']);

    expect(result.valid).toBe(true);
    expect(result.granted).toEqual([]);
  });

  it('should handle empty approved', () => {
    const result = validatePermissions(['NETWORK'], []);

    expect(result.valid).toBe(false);
    expect(result.denied).toEqual(['NETWORK']);
  });
});

describe('isPermissionSubset', () => {
  it('should return true for subset', () => {
    expect(isPermissionSubset(['NETWORK'], ['NETWORK', 'SHELL'])).toBe(true);
  });

  it('should return true for equal sets', () => {
    expect(isPermissionSubset(['NETWORK', 'SHELL'], ['NETWORK', 'SHELL'])).toBe(true);
  });

  it('should return false for non-subset', () => {
    expect(isPermissionSubset(['NETWORK', 'SHELL'], ['NETWORK'])).toBe(false);
  });

  it('should return true for empty request', () => {
    expect(isPermissionSubset([], ['NETWORK'])).toBe(true);
  });
});

describe('describePermission', () => {
  it('should describe NETWORK', () => {
    expect(describePermission('NETWORK')).toContain('HTTP');
  });

  it('should describe FILESYSTEM', () => {
    expect(describePermission('FILESYSTEM')).toContain('file');
  });

  it('should describe SHELL', () => {
    expect(describePermission('SHELL')).toContain('shell');
  });

  it('should describe all permissions', () => {
    const perms = ['NETWORK', 'FILESYSTEM', 'SHELL', 'PROVIDER_ACCESS', 'CHANNEL_ACCESS', 'MEMORY_ACCESS'] as const;
    for (const perm of perms) {
      expect(describePermission(perm)).toBeTruthy();
    }
  });
});
