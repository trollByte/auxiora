import type { Message } from './types.js';

const TOOL_RESULTS_PREFIX = '[Tool Results]';
const TOOL_ANNOUNCE_PATTERN = /I'll use \S+/;
const NUDGE_PATTERNS = [
  /^Please proceed/,
  /^Continue where you left off/,
  /^Now synthesize all the information/,
];

function isToolResult(m: Message): boolean {
  return m.role === 'user' && m.content.startsWith(TOOL_RESULTS_PREFIX);
}

function isToolAnnounce(m: Message): boolean {
  return m.role === 'assistant' && TOOL_ANNOUNCE_PATTERN.test(m.content);
}

function isNudge(m: Message): boolean {
  return m.role === 'user' && NUDGE_PATTERNS.some(p => p.test(m.content));
}

function isToolLoopMessage(m: Message): boolean {
  return isToolResult(m) || isToolAnnounce(m) || isNudge(m);
}

function dropEmpty(messages: Message[]): Message[] {
  return messages.filter((m) => m.content.trim().length > 0);
}

function dropTrailingOrphans(messages: Message[]): Message[] {
  const result = [...messages];
  let changed = true;

  while (changed && result.length > 0) {
    changed = false;
    const last = result[result.length - 1];

    if (isToolResult(last) || isNudge(last)) {
      result.pop();
      changed = true;
      continue;
    }

    if (isToolAnnounce(last)) {
      result.pop();
      changed = true;
      continue;
    }
  }

  return result;
}

/**
 * Remove orphaned tool-loop sequences that appear before the final user message.
 *
 * When an agentic tool loop is interrupted (timeout, error, context limit),
 * the session may contain a chain of:
 *   assistant: "I'll use X" → user: "[Tool Results]..." → assistant: "I'll use Y" → ...
 *
 * If these orphaned exchanges sit between the last real user message and a new
 * user message, the AI will try to continue the interrupted task instead of
 * responding to the new question.
 *
 * This function finds the last real user message (non-tool-result, non-nudge)
 * and removes any orphaned tool-loop messages that follow it.
 */
function dropOrphanedToolLoops(messages: Message[]): Message[] {
  if (messages.length === 0) return messages;

  // Find the index of the last real user message (not a tool result or nudge)
  let lastRealUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && !isToolResult(messages[i]) && !isNudge(messages[i])) {
      lastRealUserIdx = i;
      break;
    }
  }

  if (lastRealUserIdx === -1) return messages;

  // Check if everything after the last real user message is tool-loop debris
  // (tool announces, tool results, nudges) with no final substantive assistant reply
  let hasSubstantiveAssistantReply = false;
  for (let i = lastRealUserIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && !isToolAnnounce(m)) {
      hasSubstantiveAssistantReply = true;
      break;
    }
  }

  if (hasSubstantiveAssistantReply) return messages;

  // Everything after lastRealUserIdx is orphaned tool-loop debris — remove it
  const afterLastUser = messages.slice(lastRealUserIdx + 1);
  if (afterLastUser.length > 0 && afterLastUser.every(isToolLoopMessage)) {
    return messages.slice(0, lastRealUserIdx + 1);
  }

  return messages;
}

function mergeSameRole(messages: Message[]): Message[] {
  if (messages.length === 0) return [];

  const result: Message[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = result[result.length - 1];
    const curr = messages[i];

    if (curr.role === prev.role) {
      result[result.length - 1] = {
        ...prev,
        content: prev.content + '\n\n' + curr.content,
      };
    } else {
      result.push(curr);
    }
  }

  return result;
}

export function sanitizeTranscript(messages: Message[]): Message[] {
  let result = dropEmpty(messages);
  result = dropOrphanedToolLoops(result);
  result = dropTrailingOrphans(result);
  result = mergeSameRole(result);
  return result;
}
