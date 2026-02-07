import type { PluginPermission } from './types.js';
import { ALL_PLUGIN_PERMISSIONS } from './types.js';

export interface PermissionValidationResult {
  valid: boolean;
  granted: PluginPermission[];
  denied: PluginPermission[];
  unknown: string[];
}

export function validatePermissions(
  requested: string[],
  approved: PluginPermission[],
): PermissionValidationResult {
  const approvedSet = new Set(approved);
  const granted: PluginPermission[] = [];
  const denied: PluginPermission[] = [];
  const unknown: string[] = [];

  for (const perm of requested) {
    if (!ALL_PLUGIN_PERMISSIONS.includes(perm as PluginPermission)) {
      unknown.push(perm);
    } else if (approvedSet.has(perm as PluginPermission)) {
      granted.push(perm as PluginPermission);
    } else {
      denied.push(perm as PluginPermission);
    }
  }

  return {
    valid: denied.length === 0 && unknown.length === 0,
    granted,
    denied,
    unknown,
  };
}

export function isPermissionSubset(
  requested: PluginPermission[],
  allowed: PluginPermission[],
): boolean {
  const allowedSet = new Set(allowed);
  return requested.every(p => allowedSet.has(p));
}

export function describePermission(permission: PluginPermission): string {
  const descriptions: Record<PluginPermission, string> = {
    NETWORK: 'Make HTTP requests and access external services',
    FILESYSTEM: 'Read and write files on the local filesystem',
    SHELL: 'Execute shell commands',
    PROVIDER_ACCESS: 'Access AI model providers',
    CHANNEL_ACCESS: 'Send and receive messages through channels',
    MEMORY_ACCESS: 'Read and write to the memory store',
  };

  return descriptions[permission] ?? 'Unknown permission';
}
