import type { Message } from './types.js';

/** Injected function that summarizes text using an AI provider. */
export type SummarizeFn = (prompt: string) => Promise<string>;

/** Max chars to include in a single summarization prompt. */
const MAX_PROMPT_CHARS = 50_000;

/**
 * Summarize a list of messages using AI with progressive fallback.
 *
 * 1. Try summarizing all messages in one call.
 * 2. If too large, chunk into groups and summarize each, then merge.
 * 3. If all calls fail, return a size-only description.
 */
export async function summarizeMessages(
  messages: Message[],
  summarize: SummarizeFn,
): Promise<string> {
  if (messages.length === 0) {
    return '[0 messages — nothing to summarize]';
  }

  const formatted = formatMessages(messages);

  // Tier 1: Try single-call summarization
  if (formatted.length <= MAX_PROMPT_CHARS) {
    try {
      return await summarize(buildPrompt(formatted));
    } catch {
      return sizeOnlyDescription(messages);
    }
  }

  // Tier 2: Chunk and summarize
  try {
    return await chunkAndSummarize(messages, summarize);
  } catch {
    return sizeOnlyDescription(messages);
  }
}

function formatMessages(messages: Message[]): string {
  return messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n');
}

function buildPrompt(formatted: string): string {
  return (
    'Summarize the following conversation concisely. ' +
    'Preserve key decisions, user preferences, established facts, and action items. ' +
    'Be factual and brief.\n\n' +
    formatted
  );
}

async function chunkAndSummarize(
  messages: Message[],
  summarize: SummarizeFn,
): Promise<string> {
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentLength = 0;

  for (const msg of messages) {
    const msgLength = msg.content.length + msg.role.length + 10;
    if (currentLength + msgLength > MAX_PROMPT_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(msg);
    currentLength += msgLength;
  }
  if (current.length > 0) chunks.push(current);

  // Summarize each chunk
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const formatted = formatMessages(chunk);
    const summary = await summarize(buildPrompt(formatted));
    chunkSummaries.push(summary);
  }

  // Merge summaries
  if (chunkSummaries.length === 1) return chunkSummaries[0]!;

  const mergePrompt =
    'Merge these conversation summaries into one cohesive summary. ' +
    'Preserve key decisions, preferences, and facts.\n\n' +
    chunkSummaries.map((s, i) => `Part ${i + 1}:\n${s}`).join('\n\n');

  return await summarize(mergePrompt);
}

function sizeOnlyDescription(messages: Message[]): string {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const from = first ? new Date(first.timestamp).toISOString() : 'unknown';
  const to = last ? new Date(last.timestamp).toISOString() : 'unknown';
  return `[${messages.length} messages from ${from} to ${to} — summarization failed]`;
}
