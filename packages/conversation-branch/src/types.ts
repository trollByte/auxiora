export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface BranchPoint {
  messageId: string;
  branchIds: string[];
  createdAt: number;
}

export interface Branch {
  id: string;
  parentBranchId?: string;
  forkMessageId?: string;
  messages: Message[];
  label?: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface ConversationTree {
  id: string;
  rootBranchId: string;
  branches: Map<string, Branch>;
  branchPoints: Map<string, BranchPoint>;
  activeBranchId: string;
  createdAt: number;
}
