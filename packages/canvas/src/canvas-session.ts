import { nanoid } from 'nanoid';
import type {
  CanvasObject,
  CanvasEvent,
  CanvasEventType,
  CanvasSnapshot,
  ViewerInfo,
} from './types.js';

export type EventHandler = (event: CanvasEvent) => void;

export interface CanvasSessionOptions {
  id?: string;
  width?: number;
  height?: number;
}

export class CanvasSession {
  readonly id: string;
  private objects: Map<string, CanvasObject> = new Map();
  private viewers: Map<string, ViewerInfo> = new Map();
  private listeners: Map<CanvasEventType, Set<EventHandler>> = new Map();
  private nextZIndex: number = 1;
  private width: number;
  private height: number;
  readonly createdAt: string;

  constructor(options: CanvasSessionOptions = {}) {
    this.id = options.id ?? nanoid(12);
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.createdAt = new Date().toISOString();
  }

  addObject(obj: Omit<CanvasObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'> & { id?: string }): CanvasObject {
    const now = new Date().toISOString();
    const object = {
      ...obj,
      id: obj.id ?? nanoid(10),
      zIndex: this.nextZIndex++,
      createdAt: now,
      updatedAt: now,
    } as CanvasObject;

    this.objects.set(object.id, object);
    this.emit({ type: 'object:added', sessionId: this.id, objectId: object.id, data: object });
    return object;
  }

  updateObject(id: string, updates: Partial<Omit<CanvasObject, 'id' | 'type' | 'createdAt'>>): CanvasObject | null {
    const existing = this.objects.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      type: existing.type,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    } as CanvasObject;

    this.objects.set(id, updated);
    this.emit({ type: 'object:updated', sessionId: this.id, objectId: id, data: updated });
    return updated;
  }

  removeObject(id: string): boolean {
    const existed = this.objects.delete(id);
    if (existed) {
      this.emit({ type: 'object:removed', sessionId: this.id, objectId: id });
    }
    return existed;
  }

  getObject(id: string): CanvasObject | undefined {
    return this.objects.get(id);
  }

  getObjects(): CanvasObject[] {
    return Array.from(this.objects.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  getObjectCount(): number {
    return this.objects.size;
  }

  clear(): void {
    this.objects.clear();
    this.nextZIndex = 1;
    this.emit({ type: 'canvas:cleared', sessionId: this.id });
  }

  snapshot(): CanvasSnapshot {
    const snap: CanvasSnapshot = {
      sessionId: this.id,
      objects: this.getObjects(),
      width: this.width,
      height: this.height,
      takenAt: new Date().toISOString(),
    };
    this.emit({ type: 'canvas:snapshot', sessionId: this.id, data: snap });
    return snap;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.emit({
      type: 'canvas:resized',
      sessionId: this.id,
      data: { width, height },
    });
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  addViewer(id: string, name?: string): ViewerInfo {
    const viewer: ViewerInfo = {
      id,
      name,
      joinedAt: new Date().toISOString(),
    };
    this.viewers.set(id, viewer);
    this.emit({ type: 'viewer:joined', sessionId: this.id, data: viewer });
    return viewer;
  }

  removeViewer(id: string): boolean {
    const existed = this.viewers.delete(id);
    if (existed) {
      this.emit({ type: 'viewer:left', sessionId: this.id, data: { id } });
    }
    return existed;
  }

  getViewers(): ViewerInfo[] {
    return Array.from(this.viewers.values());
  }

  getViewerCount(): number {
    return this.viewers.size;
  }

  on(type: CanvasEventType, handler: EventHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  off(type: CanvasEventType, handler: EventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  private emit(event: Omit<CanvasEvent, 'timestamp'>): void {
    const fullEvent: CanvasEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(fullEvent);
      }
    }
  }
}
