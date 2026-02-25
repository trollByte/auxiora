export type Permission =
  | 'chat' | 'chat:admin'
  | 'tools:use' | 'tools:manage'
  | 'behaviors:view' | 'behaviors:manage'
  | 'connectors:view' | 'connectors:manage'
  | 'settings:view' | 'settings:manage'
  | 'users:view' | 'users:manage'
  | 'audit:view'
  | 'mcp:use' | 'mcp:manage'
  | '*';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isBuiltIn: boolean;
  createdAt: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  roleIds: string[];
  isActive: boolean;
  lastLoginAt?: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  matchedRole?: string;
}
