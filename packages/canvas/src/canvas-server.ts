import { CanvasSession, type CanvasSessionOptions } from './canvas-session.js';
import type { CanvasEvent, CanvasEventType } from './types.js';

export type ServerEventHandler = (event: CanvasEvent) => void;

export interface CanvasServerOptions {
  maxSessions?: number;
}

export class CanvasServer {
  private sessions: Map<string, CanvasSession> = new Map();
  private globalListeners: Map<CanvasEventType, Set<ServerEventHandler>> = new Map();
  private maxSessions: number;

  constructor(options: CanvasServerOptions = {}) {
    this.maxSessions = options.maxSessions ?? 100;
  }

  createSession(options?: CanvasSessionOptions): CanvasSession {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum sessions (${this.maxSessions}) reached`);
    }

    const session = new CanvasSession(options);
    this.sessions.set(session.id, session);

    // Forward session events to global listeners
    const eventTypes: CanvasEventType[] = [
      'object:added',
      'object:updated',
      'object:removed',
      'canvas:cleared',
      'canvas:snapshot',
      'canvas:resized',
      'interaction:click',
      'interaction:input',
      'viewer:joined',
      'viewer:left',
    ];

    for (const eventType of eventTypes) {
      session.on(eventType, (event) => {
        const handlers = this.globalListeners.get(eventType);
        if (handlers) {
          for (const handler of handlers) {
            handler(event);
          }
        }
      });
    }

    return session;
  }

  getSession(id: string): CanvasSession | undefined {
    return this.sessions.get(id);
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    session.clear();
    this.sessions.delete(id);
    return true;
  }

  getSessions(): CanvasSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  on(type: CanvasEventType, handler: ServerEventHandler): void {
    if (!this.globalListeners.has(type)) {
      this.globalListeners.set(type, new Set());
    }
    this.globalListeners.get(type)!.add(handler);
  }

  off(type: CanvasEventType, handler: ServerEventHandler): void {
    this.globalListeners.get(type)?.delete(handler);
  }

  destroy(): void {
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
    this.globalListeners.clear();
  }
}
