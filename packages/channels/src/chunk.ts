/**
 * Markdown-aware text chunking for channel adapters.
 *
 * Splitting priority:
 * 1. If text fits, return as-is
 * 2. Never split inside fenced code blocks (find closing fence first)
 * 3. Prefer paragraph boundaries (\n\n)
 * 4. Fall back to newline boundaries (\n)
 * 5. Fall back to space boundaries
 * 6. Hard cut at maxLength
 * 7. Oversized code blocks split at newlines within the block
 */

const LINK_RE = /\[[^\]]*\]\([^)]*\)/g;

export function chunkMarkdown(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Check if we are at a fenced code block
    const fenceMatch = remaining.match(/^```[^\n]*\n/);
    if (fenceMatch) {
      const closeIndex = remaining.indexOf('\n```', fenceMatch[0].length);
      if (closeIndex !== -1) {
        const blockEnd = closeIndex + 4;
        const lineEnd = remaining.indexOf('\n', blockEnd);
        const fullBlockEnd = lineEnd === -1 ? remaining.length : lineEnd;

        if (fullBlockEnd <= maxLength) {
          chunks.push(remaining.slice(0, fullBlockEnd).trimEnd());
          remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
          continue;
        }
        const blockText = remaining.slice(0, fullBlockEnd);
        chunks.push(...splitCodeBlock(blockText, maxLength));
        remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
        continue;
      }
    }

    const breakPoint = findBreakPoint(remaining, maxLength);
    chunks.push(remaining.slice(0, breakPoint).trimEnd());
    remaining = remaining.slice(breakPoint).replace(/^\n+/, '').trimStart();
  }

  return chunks;
}

function findBreakPoint(text: string, maxLength: number): number {
  const window = text.slice(0, maxLength);

  // Check for a fenced code block starting within the window
  const fenceStart = window.search(/\n```[^\n]*\n/);
  if (fenceStart !== -1) {
    const afterOpen = text.indexOf('\n', fenceStart + 1);
    if (afterOpen !== -1) {
      const closeIdx = text.indexOf('\n```', afterOpen);
      if (closeIdx !== -1 && closeIdx < maxLength) {
        const lineEnd = text.indexOf('\n', closeIdx + 4);
        const end = lineEnd === -1 ? closeIdx + 4 : lineEnd;
        if (end <= maxLength) {
          return end;
        }
      }
    }
    if (fenceStart > 0) {
      return fenceStart;
    }
  }

  // Try paragraph boundary
  let bp = window.lastIndexOf('\n\n');
  if (bp > maxLength / 4) {
    return bp;
  }

  // Try newline boundary
  bp = window.lastIndexOf('\n');
  if (bp > maxLength / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Try space boundary
  bp = window.lastIndexOf(' ');
  if (bp > maxLength / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Hard cut
  return maxLength;
}

function isInsideLink(text: string, position: number): boolean {
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position > start && position < end) {
      return true;
    }
    if (start > position) break;
  }
  return false;
}

function splitCodeBlock(block: string, maxLength: number): string[] {
  const lines = block.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}
