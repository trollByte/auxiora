import type { Message } from './types.js';

/**
 * Create a synthetic system message indicating omitted history.
 * Returns undefined if no messages were omitted.
 */
export function insertOmissionMarker(allCount: number, selectedCount: number): Message | undefined {
  const omitted = allCount - selectedCount;
  if (omitted <= 0) return undefined;

  const plural = omitted === 1 ? 'message' : 'messages';
  return {
    id: `_omission_marker_${Date.now()}`,
    role: 'system',
    content: `[...${omitted} earlier ${plural} omitted...]`,
    timestamp: Date.now(),
  };
}

/**
 * Truncate a message's content if it exceeds maxChars.
 * Keeps the first 40% and last 40%, with a marker in between.
 */
export function truncateLargeMessage(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  const headSize = Math.floor(maxChars * 0.4);
  const tailSize = Math.floor(maxChars * 0.4);
  const omitted = content.length - headSize - tailSize;

  return `${content.slice(0, headSize)}\n[...truncated ${omitted} chars...]\n${content.slice(-tailSize)}`;
}

/**
 * Apply progressive degradation to context messages.
 *
 * Tier 1: Insert omission marker if messages were dropped.
 * Tier 2: Truncate individual messages exceeding maxMessageChars.
 */
export function degradeContext(
  allMessages: Message[],
  selectedMessages: Message[],
  budget: number,
  maxMessageChars: number = 8000,
): Message[] {
  // Tier 2: Truncate oversized messages
  const truncated = selectedMessages.map((msg) => {
    const newContent = truncateLargeMessage(msg.content, maxMessageChars);
    if (newContent === msg.content) return msg;
    return { ...msg, content: newContent };
  });

  // Tier 1: Insert omission marker if messages were dropped
  const marker = insertOmissionMarker(allMessages.length, selectedMessages.length);
  if (!marker) return truncated;

  if (truncated.length === 0) return [marker];

  // Keep first 2 messages (context anchors), insert marker, then rest
  // Ensure at least one message remains after the marker
  const anchorCount = Math.min(2, Math.max(1, truncated.length - 1));
  const anchors = truncated.slice(0, anchorCount);
  const rest = truncated.slice(anchorCount);

  return [...anchors, marker, ...rest];
}
