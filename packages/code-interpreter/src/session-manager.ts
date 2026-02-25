import { randomUUID } from 'node:crypto';
import { getLogger } from '@auxiora/logger';
import type { CodeExecutor } from './executor.js';
import type {
  ExecutionResult,
  InterpreterConfig,
  Language,
  ReplSession,
} from './types.js';

const logger = getLogger('code-interpreter:session-manager');

const DEFAULT_MAX_SESSIONS = 5;
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MEMORY_LIMIT = 256;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class SessionManager {
  private sessions: Map<string, ReplSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;
  private readonly maxSessions: number;
  private readonly defaultTimeout: number;
  private readonly defaultMemoryLimit: number;
  private readonly allowedLanguages: Language[] | undefined;

  constructor(
    private executor: CodeExecutor,
    config?: InterpreterConfig,
  ) {
    this.maxSessions = config?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.defaultTimeout = config?.defaultTimeout ?? DEFAULT_TIMEOUT;
    this.defaultMemoryLimit = config?.defaultMemoryLimit ?? DEFAULT_MEMORY_LIMIT;
    this.allowedLanguages = config?.allowedLanguages;

    this.cleanupTimer = setInterval(() => this.cleanupIdleSessions(), 60_000);
    // Allow the process to exit even with this timer running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  createSession(language: Language): ReplSession {
    if (this.allowedLanguages && !this.allowedLanguages.includes(language)) {
      throw new Error(`Language "${language}" is not allowed`);
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum number of sessions (${this.maxSessions}) reached`,
      );
    }

    const session: ReplSession = {
      id: randomUUID(),
      language,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      history: [],
    };

    this.sessions.set(session.id, session);
    logger.info('Session created', { sessionId: session.id, language });

    return session;
  }

  async execute(sessionId: string, code: string): Promise<ExecutionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }

    session.lastActivity = Date.now();

    const result = await this.executor.execute({
      code,
      language: session.language,
      timeoutMs: this.defaultTimeout,
      memoryLimitMb: this.defaultMemoryLimit,
    });

    session.history.push({ code, result });

    return result;
  }

  getSession(id: string): ReplSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): ReplSession[] {
    return Array.from(this.sessions.values());
  }

  destroySession(id: string): void {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      logger.info('Session destroyed', { sessionId: id });
    }
  }

  destroyAll(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    logger.info('All sessions destroyed', { count });
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        this.sessions.delete(id);
        logger.info('Idle session cleaned up', { sessionId: id });
      }
    }
  }
}
