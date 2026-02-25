import type { MediaResult } from './types.js';

export function formatMediaResults(results: MediaResult[], userText: string): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.success || !result.text) continue;

    switch (result.type) {
      case 'audio':
        sections.push(`[Audio]\nTranscript: ${result.text}`);
        break;
      case 'image':
        sections.push(`[Image]\nDescription: ${result.text}`);
        break;
      case 'video':
        sections.push(`[Video]\nDescription: ${result.text}`);
        break;
      case 'file':
        sections.push(`[File: ${result.filename ?? 'unknown'}]\nContent: ${result.text}`);
        break;
    }
  }

  if (sections.length === 0) return userText;

  const mediaSection = sections.join('\n\n');
  return userText ? `${mediaSection}\n\n${userText}` : mediaSection;
}
