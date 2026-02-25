/** Agent identifier in the form auxiora://user@host */
export interface AgentIdentifier {
  user: string;
  host: string;
}

export type AgentMessageType =
  | 'text'
  | 'request'
  | 'response'
  | 'capability_query'
  | 'capability_response'
  | 'ping'
  | 'pong';

/** A message exchanged between agents. */
export interface AgentMessage {
  id: string;
  from: AgentIdentifier;
  to: AgentIdentifier;
  type: AgentMessageType;
  payload: string;
  timestamp: number;
  signature?: string;
  replyTo?: string;
}

/** A capability offered by an agent. */
export interface AgentCapability {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** An entry in the agent directory. */
export interface AgentDirectoryEntry {
  identifier: AgentIdentifier;
  displayName: string;
  capabilities: AgentCapability[];
  publicKey: string;
  endpoint: string;
  lastSeen: number;
  registeredAt: number;
}

/** Format an AgentIdentifier to its URI form. */
export function formatAgentId(id: AgentIdentifier): string {
  return `auxiora://${id.user}@${id.host}`;
}

/** Parse an agent URI string to an AgentIdentifier. */
export function parseAgentId(uri: string): AgentIdentifier | undefined {
  const match = uri.match(/^auxiora:\/\/([^@]+)@(.+)$/);
  if (!match) return undefined;
  return { user: match[1], host: match[2] };
}
