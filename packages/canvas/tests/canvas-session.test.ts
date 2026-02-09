import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasSession } from '../src/canvas-session.js';
import type { CanvasEvent, TextObject, InteractiveObject, ImageObject } from '../src/types.js';

describe('CanvasSession', () => {
  let session: CanvasSession;

  beforeEach(() => {
    session = new CanvasSession({ id: 'test-session', width: 800, height: 600 });
  });

  describe('constructor', () => {
    it('should create session with provided options', () => {
      expect(session.id).toBe('test-session');
      expect(session.getSize()).toEqual({ width: 800, height: 600 });
    });

    it('should use defaults when no options given', () => {
      const s = new CanvasSession();
      expect(s.id).toBeTruthy();
      expect(s.getSize()).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('addObject', () => {
    it('should add a text object', () => {
      const obj = session.addObject({
        type: 'text',
        x: 10,
        y: 20,
        width: 200,
        height: 50,
        visible: true,
        content: 'Hello',
        fontSize: 16,
        fontFamily: 'sans-serif',
        color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(obj.id).toBeTruthy();
      expect(obj.type).toBe('text');
      expect((obj as TextObject).content).toBe('Hello');
      expect(obj.zIndex).toBe(1);
      expect(obj.createdAt).toBeTruthy();
    });

    it('should auto-increment zIndex', () => {
      const obj1 = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'A', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      const obj2 = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'B', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(obj2.zIndex).toBeGreaterThan(obj1.zIndex);
    });

    it('should use custom id if provided', () => {
      const obj = session.addObject({
        id: 'custom-id',
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'zIndex' | 'createdAt' | 'updatedAt'> & { id: string });

      expect(obj.id).toBe('custom-id');
    });

    it('should emit object:added event', () => {
      const handler = vi.fn();
      session.on('object:added', handler);

      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].type).toBe('object:added');
    });
  });

  describe('updateObject', () => {
    it('should update object properties', () => {
      const obj = session.addObject({
        type: 'text',
        x: 10, y: 20, width: 200, height: 50, visible: true,
        content: 'Hello', fontSize: 16, fontFamily: 'sans-serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      const updated = session.updateObject(obj.id, { x: 100, y: 200 });
      expect(updated).not.toBeNull();
      expect(updated!.x).toBe(100);
      expect(updated!.y).toBe(200);
      expect(updated!.type).toBe('text');
    });

    it('should return null for non-existent object', () => {
      const result = session.updateObject('nonexistent', { x: 0 });
      expect(result).toBeNull();
    });

    it('should emit object:updated event', () => {
      const handler = vi.fn();
      session.on('object:updated', handler);

      const obj = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      session.updateObject(obj.id, { x: 50 });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('removeObject', () => {
    it('should remove existing object', () => {
      const obj = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(session.removeObject(obj.id)).toBe(true);
      expect(session.getObject(obj.id)).toBeUndefined();
    });

    it('should return false for non-existent object', () => {
      expect(session.removeObject('nonexistent')).toBe(false);
    });

    it('should emit object:removed event', () => {
      const handler = vi.fn();
      session.on('object:removed', handler);

      const obj = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      session.removeObject(obj.id);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('getObjects', () => {
    it('should return objects sorted by zIndex', () => {
      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'A', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'B', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      const objects = session.getObjects();
      expect(objects).toHaveLength(2);
      expect(objects[0].zIndex).toBeLessThan(objects[1].zIndex);
    });
  });

  describe('clear', () => {
    it('should remove all objects', () => {
      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'A', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      session.clear();
      expect(session.getObjectCount()).toBe(0);
    });

    it('should reset zIndex counter', () => {
      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'A', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      session.clear();

      const obj = session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'B', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(obj.zIndex).toBe(1);
    });

    it('should emit canvas:cleared event', () => {
      const handler = vi.fn();
      session.on('canvas:cleared', handler);
      session.clear();
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('snapshot', () => {
    it('should capture current state', () => {
      session.addObject({
        type: 'text',
        x: 10, y: 20, width: 200, height: 50, visible: true,
        content: 'Hello', fontSize: 16, fontFamily: 'sans-serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      const snap = session.snapshot();
      expect(snap.sessionId).toBe('test-session');
      expect(snap.objects).toHaveLength(1);
      expect(snap.width).toBe(800);
      expect(snap.height).toBe(600);
      expect(snap.takenAt).toBeTruthy();
    });
  });

  describe('resize', () => {
    it('should update canvas dimensions', () => {
      session.resize(1024, 768);
      expect(session.getSize()).toEqual({ width: 1024, height: 768 });
    });

    it('should emit canvas:resized event', () => {
      const handler = vi.fn();
      session.on('canvas:resized', handler);
      session.resize(1024, 768);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].data).toEqual({ width: 1024, height: 768 });
    });
  });

  describe('viewers', () => {
    it('should add and list viewers', () => {
      session.addViewer('v1', 'Alice');
      session.addViewer('v2', 'Bob');

      const viewers = session.getViewers();
      expect(viewers).toHaveLength(2);
      expect(viewers[0].name).toBe('Alice');
    });

    it('should remove viewer', () => {
      session.addViewer('v1', 'Alice');
      expect(session.removeViewer('v1')).toBe(true);
      expect(session.getViewerCount()).toBe(0);
    });

    it('should return false when removing non-existent viewer', () => {
      expect(session.removeViewer('nonexistent')).toBe(false);
    });

    it('should emit viewer events', () => {
      const joinHandler = vi.fn();
      const leaveHandler = vi.fn();
      session.on('viewer:joined', joinHandler);
      session.on('viewer:left', leaveHandler);

      session.addViewer('v1', 'Alice');
      expect(joinHandler).toHaveBeenCalledOnce();

      session.removeViewer('v1');
      expect(leaveHandler).toHaveBeenCalledOnce();
    });
  });

  describe('event handling', () => {
    it('should register and unregister handlers', () => {
      const handler = vi.fn();
      session.on('object:added', handler);

      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);
      expect(handler).toHaveBeenCalledOnce();

      session.off('object:added', handler);

      session.addObject({
        type: 'text',
        x: 0, y: 0, width: 100, height: 100, visible: true,
        content: 'Test2', fontSize: 14, fontFamily: 'serif', color: '#000',
      } as Omit<TextObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);
      // Should still be 1 since handler was removed
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('different object types', () => {
    it('should handle image objects', () => {
      const obj = session.addObject({
        type: 'image',
        x: 0, y: 0, width: 300, height: 200, visible: true,
        src: 'https://example.com/img.png',
        alt: 'Test image',
      } as Omit<ImageObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(obj.type).toBe('image');
      expect((obj as ImageObject).src).toBe('https://example.com/img.png');
    });

    it('should handle interactive objects', () => {
      const obj = session.addObject({
        type: 'interactive',
        x: 0, y: 0, width: 120, height: 40, visible: true,
        elementKind: 'button',
        label: 'Click me',
        value: '',
        disabled: false,
      } as Omit<InteractiveObject, 'id' | 'zIndex' | 'createdAt' | 'updatedAt'>);

      expect(obj.type).toBe('interactive');
      expect((obj as InteractiveObject).elementKind).toBe('button');
      expect((obj as InteractiveObject).label).toBe('Click me');
    });

    it('should handle widget objects', () => {
      const obj = session.addObject({
        type: 'widget',
        x: 0, y: 0, width: 400, height: 300, visible: true,
        widgetType: 'chart',
        props: { data: [1, 2, 3] },
      });

      expect(obj.type).toBe('widget');
    });

    it('should handle drawing objects', () => {
      const obj = session.addObject({
        type: 'drawing',
        x: 0, y: 0, width: 500, height: 500, visible: true,
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        strokeColor: '#ff0000',
        strokeWidth: 2,
      });

      expect(obj.type).toBe('drawing');
    });
  });
});
