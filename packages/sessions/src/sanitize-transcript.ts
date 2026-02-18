import type { Message } from './types.js';

const TOOL_RESULTS_PREFIX = '[Tool Results]';
const TOOL_ANNOUNCE_PATTERN = /I'll use \S+/;

function dropEmpty(messages: Message[]): Message[] {
  return messages.filter((m) => m.content.trim().length > 0);
}

function dropTrailingOrphans(messages: Message[]): Message[] {
  const result = [...messages];
  let changed = true;

  while (changed && result.length > 0) {
    changed = false;
    const last = result[result.length - 1];

    if (last.role === 'user' && last.content.startsWith(TOOL_RESULTS_PREFIX)) {
      result.pop();
      changed = true;
      continue;
    }

    if (last.role === 'assistant' && TOOL_ANNOUNCE_PATTERN.test(last.content)) {
      result.pop();
      changed = true;
      continue;
    }
  }

  return result;
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
  result = dropTrailingOrphans(result);
  result = mergeSameRole(result);
  return result;
}
