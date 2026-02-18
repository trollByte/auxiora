/** Permission scopes for role-based access control. */
export type PermissionScope =
  | 'memory:read'
  | 'memory:write'
  | 'memory:delete'
  | 'sessions:read'
  | 'sessions:write'
  | 'behaviors:read'
  | 'behaviors:write'
  | 'behaviors:delete'
  | 'vault:read'
  | 'vault:write'
  | 'trust:read'
  | 'trust:write'
  | 'plugins:manage'
  | 'webhooks:manage'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:approve'
  | 'agent-protocol:send'
  | 'agent-protocol:receive'
  | 'admin';

/** A named role with associated permissions. */
export interface Role {
  id: string;
  name: string;
  permissions: PermissionScope[];
  builtIn: boolean;
  createdAt: number;
}

/** Per-account overrides for streaming/coalescing behavior. */
export interface StreamingOverrides {
  /** Coalescing idle timeout in milliseconds. Default: 1000 */
  coalescingIdleMs?: number;
  /** Minimum characters per coalesced chunk. Default: 800 */
  minChunkChars?: number;
  /** Maximum characters per coalesced chunk. Default: 1200 */
  maxChunkChars?: number;
  /** Typing indicator delay in milliseconds. Default: 4000 */
  typingDelayMs?: number;
}

/** A user identity within the system. */
export interface UserIdentity {
  id: string;
  name: string;
  role: string;
  channels: UserChannelMapping[];
  trustOverrides: Record<string, number>;
  memoryPartition: string;
  personalityRelationship: string;
  streamingOverrides?: StreamingOverrides;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
}

/** Maps an external channel sender to this user. */
export interface UserChannelMapping {
  channelType: string;
  senderId: string;
}

/** Configuration for a team of users. */
export interface TeamConfig {
  name: string;
  ownerId: string;
  memberIds: string[];
  sharedMemoryPartition: string;
  createdAt: number;
}

/** Built-in role definitions. */
export const BUILT_IN_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Admin',
    permissions: ['admin'],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'member',
    name: 'Member',
    permissions: [
      'memory:read',
      'memory:write',
      'sessions:read',
      'sessions:write',
      'behaviors:read',
      'workflows:read',
      'workflows:write',
      'workflows:approve',
      'agent-protocol:send',
      'agent-protocol:receive',
    ],
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'viewer',
    name: 'Viewer',
    permissions: [
      'memory:read',
      'sessions:read',
      'behaviors:read',
      'workflows:read',
    ],
    builtIn: true,
    createdAt: 0,
  },
];
