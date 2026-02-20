export class DocumentChunker {
  chunk(
    content: string,
    opts?: { maxTokens?: number; overlap?: number },
  ): string[] {
    const maxTokens = opts?.maxTokens ?? 500;
    const overlap = opts?.overlap ?? 50;

    const segments = this.splitIntoParagraphs(content);
    return this.assembleChunks(segments, maxTokens, overlap);
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private splitIntoParagraphs(content: string): string[] {
    const paragraphs = content.split(/\n\n+/);
    const segments: string[] = [];

    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      if (this.estimateTokens(trimmed) > 500) {
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          const st = s.trim();
          if (st) segments.push(st);
        }
      } else {
        segments.push(trimmed);
      }
    }

    return segments;
  }

  private assembleChunks(
    segments: string[],
    maxTokens: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    let currentContent = '';

    for (const segment of segments) {
      const combined = currentContent
        ? currentContent + '\n\n' + segment
        : segment;

      if (this.estimateTokens(combined) > maxTokens && currentContent) {
        chunks.push(currentContent);

        const overlapContent = this.getOverlapContent(currentContent, overlap);
        currentContent = overlapContent
          ? overlapContent + '\n\n' + segment
          : segment;
      } else {
        currentContent = combined;
      }
    }

    if (currentContent.trim()) {
      chunks.push(currentContent);
    }

    return chunks;
  }

  private getOverlapContent(content: string, overlapTokens: number): string {
    if (overlapTokens <= 0) return '';
    const words = content.split(/\s+/);
    if (overlapTokens >= words.length) return content;
    return words.slice(-overlapTokens).join(' ');
  }
}
