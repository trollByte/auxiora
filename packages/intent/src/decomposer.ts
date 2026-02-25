import type { Intent } from './types.js';
import { IntentParser } from './parser.js';

const COMPOUND_SPLITTERS = [
  / and then /i,
  / then /i,
  / after that /i,
  / also /i,
  /,\s*and /,
  /;\s*/,
];

export class IntentDecomposer {
  private parser: IntentParser;

  constructor(parser: IntentParser) {
    this.parser = parser;
  }

  decompose(message: string, context?: Record<string, unknown>): Intent[] {
    const parts = this.splitCompound(message);

    if (parts.length <= 1) {
      return [this.parser.parse(message, context)];
    }

    return parts.map((part) => this.parser.parse(part.trim(), context));
  }

  isCompound(message: string): boolean {
    return this.splitCompound(message).length > 1;
  }

  private splitCompound(message: string): string[] {
    let parts = [message];

    for (const splitter of COMPOUND_SPLITTERS) {
      const newParts: string[] = [];
      for (const part of parts) {
        const split = part.split(splitter);
        if (split.length > 1) {
          newParts.push(...split.filter((s) => s.trim().length > 0));
        } else {
          newParts.push(part);
        }
      }
      if (newParts.length > parts.length) {
        parts = newParts;
        break; // Use first matching splitter only
      }
    }

    return parts;
  }
}
