import { describe, it, expect } from 'vitest';
import { UserManager, RoleManager, UserResolver, BUILT_IN_ROLES } from '../src/index.js';
import type { PermissionScope, UserIdentity, Role, TeamConfig } from '../src/index.js';

describe('Social package exports', () => {
  it('should export UserManager', () => {
    expect(UserManager).toBeDefined();
  });

  it('should export RoleManager', () => {
    expect(RoleManager).toBeDefined();
  });

  it('should export UserResolver', () => {
    expect(UserResolver).toBeDefined();
  });

  it('should export BUILT_IN_ROLES', () => {
    expect(BUILT_IN_ROLES).toBeDefined();
    expect(BUILT_IN_ROLES.length).toBe(3);
  });
});
