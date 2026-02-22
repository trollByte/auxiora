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
 * 7. Oversized code blocks split at newlines within the block,
 *    with fence close/reopen across chunk boundaries
 *
 * Optional maxLines limit: when set, chunks are further split so no
 * single chunk exceeds maxLines lines. Discord collapses tall messages,
 * so adapters can pass maxLines to keep messages readable.
 */

const LINK_RE = /\[[^\]]*\]\([^)]*\)/g;

export interface ChunkOptions {
  /** Soft max line count per chunk. When set, chunks are split at line boundaries. */
  maxLines?: number;
}

export function chunkMarkdown(text: string, maxLength: number, options?: ChunkOptions): string[] {
  const maxLines = options?.maxLines;

  // Fast path: fits in one chunk (both char and line limits)
  if (text.length <= maxLength && (!maxLines || countLines(text) <= maxLines)) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength && (!maxLines || countLines(remaining) <= maxLines)) {
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
        const blockText = remaining.slice(0, fullBlockEnd);
        const blockFits = fullBlockEnd <= maxLength && (!maxLines || countLines(blockText) <= maxLines);

        if (blockFits) {
          chunks.push(blockText.trimEnd());
          remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
          continue;
        }
        chunks.push(...splitCodeBlock(blockText, maxLength, maxLines));
        remaining = remaining.slice(fullBlockEnd).replace(/^\n+/, '');
        continue;
      }
    }

    const breakPoint = findBreakPoint(remaining, maxLength, maxLines);
    chunks.push(remaining.slice(0, breakPoint).trimEnd());
    remaining = remaining.slice(breakPoint).replace(/^\n+/, '').trimStart();
  }

  return chunks;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}

function findBreakPoint(text: string, maxLength: number, maxLines?: number): number {
  let effectiveMax = maxLength;

  // If maxLines is set, find the position after maxLines lines
  if (maxLines) {
    const lineBreakPos = nthNewline(text, maxLines);
    if (lineBreakPos !== -1 && lineBreakPos < effectiveMax) {
      effectiveMax = lineBreakPos;
    }
  }

  const window = text.slice(0, effectiveMax);

  // Check for a fenced code block starting within the window
  const fenceStart = window.search(/\n```[^\n]*\n/);
  if (fenceStart !== -1) {
    const afterOpen = text.indexOf('\n', fenceStart + 1);
    if (afterOpen !== -1) {
      const closeIdx = text.indexOf('\n```', afterOpen);
      if (closeIdx !== -1 && closeIdx < effectiveMax) {
        const lineEnd = text.indexOf('\n', closeIdx + 4);
        const end = lineEnd === -1 ? closeIdx + 4 : lineEnd;
        if (end <= effectiveMax) {
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
  if (bp > effectiveMax / 4) {
    return bp;
  }

  // Try newline boundary
  bp = window.lastIndexOf('\n');
  if (bp > effectiveMax / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Try space boundary
  bp = window.lastIndexOf(' ');
  if (bp > effectiveMax / 4) {
    if (!isInsideLink(text, bp)) {
      return bp;
    }
  }

  // Hard cut
  return effectiveMax;
}

/** Returns the position of the Nth newline, or -1 if fewer than N newlines exist. */
function nthNewline(text: string, n: number): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      count++;
      if (count === n) return i;
    }
  }
  return -1;
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

/**
 * Splits an oversized code block at newline boundaries, closing and
 * reopening the fence marker on each chunk boundary so every chunk
 * renders as valid markdown.
 */
function splitCodeBlock(block: string, maxLength: number, maxLines?: number): string[] {
  const lines = block.split('\n');
  const chunks: string[] = [];

  // Extract the opening fence line (e.g. "```js") and closing fence
  const openFence = lines[0]; // e.g. "```js"
  const closeFence = '```';

  // Reserve space for fence close/reopen overhead
  const fenceOverhead = closeFence.length + 1; // +1 for newline before close

  let current = '';
  let currentLineCount = 0;

  for (const line of lines) {
    const isOpenFence = line === openFence && current === '';
    const candidate = current ? current + '\n' + line : line;
    const candidateLines = currentLineCount + 1;

    // Check if adding this line would exceed limits
    const exceedsChars = candidate.length + fenceOverhead > maxLength && current !== '';
    const exceedsLines = maxLines !== undefined && candidateLines > maxLines && current !== '';

    if (exceedsChars || exceedsLines) {
      // Flush current chunk with closing fence
      if (!current.endsWith(closeFence)) {
        chunks.push(current + '\n' + closeFence);
      } else {
        chunks.push(current);
      }
      // Start new chunk with reopened fence
      current = openFence + '\n' + line;
      currentLineCount = 2;
    } else {
      current = candidate;
      currentLineCount = candidateLines;
    }
  }

  if (current) {
    // Ensure the last chunk ends with a closing fence
    if (!current.trimEnd().endsWith(closeFence)) {
      chunks.push(current + '\n' + closeFence);
    } else {
      chunks.push(current);
    }
  }

  return chunks;
}
