import path from 'node:path';
import type { FileEvent, FileClassification } from './types.js';

type FileEventListener = (event: FileEvent) => void;

const EXTENSION_MAP: Record<string, FileClassification> = {
  '.pdf': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.txt': 'document',
  '.md': 'document',
  '.rtf': 'document',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.mp4': 'video',
  '.avi': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.ogg': 'audio',
  '.ts': 'code',
  '.js': 'code',
  '.py': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.h': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.sh': 'code',
  '.zip': 'archive',
  '.tar': 'archive',
  '.gz': 'archive',
  '.7z': 'archive',
  '.rar': 'archive',
  '.bz2': 'archive',
  '.xls': 'spreadsheet',
  '.xlsx': 'spreadsheet',
  '.csv': 'spreadsheet',
  '.ppt': 'presentation',
  '.pptx': 'presentation',
  '.key': 'presentation',
};

export class FileWatcher {
  private directories: string[];
  private listeners: FileEventListener[] = [];
  private watching = false;

  constructor(config: { directories: string[] }) {
    this.directories = config.directories;
  }

  watch(): void {
    this.watching = true;
  }

  stop(): void {
    this.watching = false;
  }

  onEvent(cb: FileEventListener): () => void {
    this.listeners.push(cb);
    return () => {
      const idx = this.listeners.indexOf(cb);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  emitEvent(event: FileEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  classifyFile(filePath: string): FileClassification {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] ?? 'other';
  }

  suggestDestination(filePath: string, baseDir?: string): { classification: FileClassification; suggestedDir: string } {
    const classification = this.classifyFile(filePath);
    const base = baseDir || '~/Documents';
    return {
      classification,
      suggestedDir: `${base}/${classification}s/`,
    };
  }
}
