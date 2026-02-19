export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapability[];
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2ATask {
  id: string;
  state: TaskState;
  messages: A2AMessage[];
  artifacts: A2AArtifact[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
  timestamp: number;
}

export type A2APart = TextPart | FilePart | DataPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface FilePart {
  type: 'file';
  name: string;
  mimeType: string;
  data: string;
}

export interface DataPart {
  type: 'data';
  mimeType: string;
  data: unknown;
}

export interface A2AArtifact {
  id: string;
  name: string;
  parts: A2APart[];
  createdAt: number;
}
