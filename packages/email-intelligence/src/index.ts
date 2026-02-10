export type {
  EmailMessage,
  TriagePriority,
  TriageResult,
  SmartReplyDraft,
  FollowUp,
  ThreadSummary,
} from './types.js';

export { EmailTriageEngine, type TriageConfig } from './triage.js';
export { SmartReplyGenerator } from './smart-reply.js';
export { FollowUpTracker } from './follow-up.js';
export { ThreadSummarizer } from './thread-summarizer.js';
