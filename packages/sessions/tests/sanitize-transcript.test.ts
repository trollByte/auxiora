import { describe, it, expect } from 'vitest';
import { sanitizeTranscript } from '../src/sanitize-transcript.js';
import type { Message } from '../src/types.js';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: `${role}-${Date.now()}-${Math.random()}`, role, content, timestamp: Date.now() };
}

describe('sanitizeTranscript', () => {
  it('should return empty array for empty input', () => {
    expect(sanitizeTranscript([])).toEqual([]);
  });

  it('should pass through a clean transcript unchanged', () => {
    const messages = [
      msg('user', 'Hello'),
      msg('assistant', 'Hi there!'),
      msg('user', 'How are you?'),
      msg('assistant', 'I am doing well.'),
    ];
    const result = sanitizeTranscript(messages);
    expect(result).toHaveLength(4);
    expect(result.map(m => m.content)).toEqual([
      'Hello', 'Hi there!', 'How are you?', 'I am doing well.',
    ]);
  });

  describe('drop empty messages', () => {
    it('should drop messages with empty content', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', ''),
        msg('user', '   '),
        msg('assistant', 'Response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Response');
    });
  });

  describe('trailing orphan [Tool Results]', () => {
    it('should drop a trailing [Tool Results] user message', () => {
      const messages = [
        msg('user', 'Please read the file'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: contents of file.ts'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Please read the file');
    });

    it('should NOT drop [Tool Results] that has a following assistant response', () => {
      const messages = [
        msg('user', 'Please read the file'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: contents of file.ts'),
        msg('assistant', 'Here is what the file contains.'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(4);
    });
  });

  describe('trailing dangling tool announcement', () => {
    it('should drop a trailing assistant tool announcement', () => {
      const messages = [
        msg('user', 'Run the tests'),
        msg('assistant', "I'll use bash to help with this."),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Run the tests');
    });

    it('should NOT drop a normal trailing assistant message', () => {
      const messages = [
        msg('user', 'What is 2+2?'),
        msg('assistant', 'The answer is 4.'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
    });
  });

  describe('consecutive same-role merge', () => {
    it('should merge consecutive user messages', () => {
      const messages = [
        msg('user', 'First part'),
        msg('user', 'Second part'),
        msg('assistant', 'Response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First part\n\nSecond part');
      expect(result[0].role).toBe('user');
    });

    it('should merge consecutive assistant messages', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'First response'),
        msg('assistant', 'Second response'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('First response\n\nSecond response');
    });
  });

  describe('orphaned tool-loop sequences (interrupted agentic loops)', () => {
    it('should drop orphaned tool chain after last real user message', () => {
      // Simulates: user asked a question → tool loop started → loop interrupted
      // → user sends new question (which triggers sanitize on the old messages)
      const messages = [
        msg('user', 'Build me a website'),
        msg('assistant', "I'll use bash to help with this."),
        msg('user', '[Tool Results]\n[bash]: mkdir created'),
        msg('assistant', "I'll use file_write to help with this."),
        msg('user', '[Tool Results]\n[file_write]: Success'),
        // Loop was interrupted here — no final assistant synthesis
      ];
      const result = sanitizeTranscript(messages);
      // All tool-loop debris after "Build me a website" should be removed
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Build me a website');
    });

    it('should preserve completed tool loops with final assistant response', () => {
      const messages = [
        msg('user', 'Build me a website'),
        msg('assistant', "I'll use bash to help with this."),
        msg('user', '[Tool Results]\n[bash]: mkdir created'),
        msg('assistant', 'I created the website for you!'), // This is a real response, not a tool announce
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(4);
    });

    it('should drop orphaned nudge messages from interrupted loops', () => {
      const messages = [
        msg('user', 'Create a project'),
        msg('assistant', "I'll use bash to help with this."),
        msg('user', '[Tool Results]\n[bash]: done'),
        msg('user', 'Please proceed — use the bash and file_write tools to do the work now. Do not describe what you will do — actually call the tools.'),
        msg('assistant', "I'll use file_write to help with this."),
        msg('user', '[Tool Results]\n[file_write]: Success'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Create a project');
    });

    it('should handle new user message after orphaned tool loop', () => {
      // When the user sends a new message after an orphaned tool loop,
      // the rollback mechanism in runtime should have already cleaned
      // the orphaned messages. But even if it didn't, sanitizeTranscript
      // ensures the new question ends up in the last user message position.
      const messages = [
        msg('user', 'Build me a website'),
        msg('assistant', "I'll use bash to help with this."),
        msg('user', '[Tool Results]\n[bash]: done'),
        msg('assistant', "I'll use file_write to help with this."),
        msg('user', '[Tool Results]\n[file_write]: Success'),
        msg('user', 'What is the weather today?'), // New real user message
      ];
      const result = sanitizeTranscript(messages);
      // The new question appears in the result (merged with tool results by mergeSameRole)
      const lastMsg = result[result.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content).toContain('What is the weather today?');
    });
  });

  describe('combined patterns', () => {
    it('should handle multiple broken patterns in one transcript', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi!'),
        msg('user', ''),
        msg('user', 'Read file.ts'),
        msg('assistant', "I'll use read_file to help with this."),
        msg('user', '[Tool Results]\nread_file: file contents'),
      ];
      const result = sanitizeTranscript(messages);
      // Tool results and tool announce stripped, empty dropped;
      // "Read file.ts" is a real user message and preserved
      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('Hello');
      expect(result[1].content).toBe('Hi!');
      expect(result[2].content).toBe('Read file.ts');
    });

    it('should never strip the trailing user message (non-tool)', () => {
      const messages = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi there!'),
        msg('user', 'How are you?'),
      ];
      const result = sanitizeTranscript(messages);
      expect(result).toHaveLength(3);
      expect(result[2].role).toBe('user');
      expect(result[2].content).toBe('How are you?');
    });
  });
});
