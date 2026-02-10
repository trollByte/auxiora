import type { ClipboardEntry } from './types.js';

const MAX_HISTORY = 100;

type ClipboardListener = (entry: ClipboardEntry) => void;

export class ClipboardMonitor {
  private history: ClipboardEntry[] = [];
  private listeners: ClipboardListener[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  getContent(): ClipboardEntry {
    if (this.history.length > 0) {
      return this.history[this.history.length - 1]!;
    }
    return { content: '', type: 'text', timestamp: Date.now() };
  }

  addEntry(content: string, type: 'text' | 'image' | 'html' = 'text'): ClipboardEntry {
    const entry: ClipboardEntry = { content, type, timestamp: Date.now() };
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    for (const listener of this.listeners) {
      listener(entry);
    }
    return entry;
  }

  onchange(cb: ClipboardListener): () => void {
    this.listeners.push(cb);
    return () => {
      const idx = this.listeners.indexOf(cb);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  startWatching(): void {
    this.intervalId = setInterval(() => {
      // No-op polling — actual clipboard reading would be platform-specific
    }, 1000);
  }

  stopWatching(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  transform(content: string, op: 'uppercase' | 'lowercase' | 'trim' | 'json-format'): string {
    switch (op) {
      case 'uppercase':
        return content.toUpperCase();
      case 'lowercase':
        return content.toLowerCase();
      case 'trim':
        return content.trim();
      case 'json-format':
        return JSON.stringify(JSON.parse(content), null, 2);
    }
  }

  getHistory(limit?: number): ClipboardEntry[] {
    if (limit !== undefined) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }
}
