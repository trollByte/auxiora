import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const MAX_TEXT_CHARS = 50_000;

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/yaml', 'application/csv'];
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.log', '.ini', '.toml', '.env', '.html', '.css', '.js', '.ts', '.py', '.sh'];

function isTextFile(attachment: Attachment): boolean {
  if (attachment.mimeType) {
    return TEXT_MIME_PREFIXES.some((p) => attachment.mimeType!.startsWith(p));
  }
  if (attachment.filename) {
    const ext = attachment.filename.slice(attachment.filename.lastIndexOf('.'));
    return TEXT_EXTENSIONS.includes(ext.toLowerCase());
  }
  return false;
}

export class FileExtractor implements MediaProvider {
  readonly id = 'file-extractor';
  readonly capabilities = ['file'] as const;

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    if (!isTextFile(attachment)) {
      return { type: 'file', success: false, error: 'unsupported file type', filename: attachment.filename };
    }

    try {
      let text: string;

      if (attachment.data) {
        text = attachment.data.toString('utf-8');
      } else if (attachment.url) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          return { type: 'file', success: false, error: `Fetch failed: ${response.status}`, filename: attachment.filename };
        }
        text = await response.text();
      } else {
        return { type: 'file', success: false, error: 'No data or URL', filename: attachment.filename };
      }

      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS) + '\n[truncated]';
      }

      return { type: 'file', success: true, text, filename: attachment.filename };
    } catch (error) {
      return { type: 'file', success: false, error: error instanceof Error ? error.message : 'Unknown error', filename: attachment.filename };
    }
  }
}
