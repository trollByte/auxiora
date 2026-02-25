export type CanvasObjectType = 'text' | 'image' | 'drawing' | 'widget' | 'interactive';

export interface CanvasObjectBase {
  id: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TextObject extends CanvasObjectBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface ImageObject extends CanvasObjectBase {
  type: 'image';
  src: string;
  alt: string;
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingObject extends CanvasObjectBase {
  type: 'drawing';
  points: DrawingPoint[];
  strokeColor: string;
  strokeWidth: number;
}

export interface WidgetObject extends CanvasObjectBase {
  type: 'widget';
  widgetType: string;
  props: Record<string, unknown>;
}

export type InteractiveElementKind = 'button' | 'input' | 'select' | 'checkbox' | 'slider';

export interface InteractiveObject extends CanvasObjectBase {
  type: 'interactive';
  elementKind: InteractiveElementKind;
  label: string;
  value: string;
  options?: string[];
  disabled: boolean;
}

export type CanvasObject = TextObject | ImageObject | DrawingObject | WidgetObject | InteractiveObject;

export type CanvasEventType =
  | 'object:added'
  | 'object:updated'
  | 'object:removed'
  | 'canvas:cleared'
  | 'canvas:snapshot'
  | 'canvas:resized'
  | 'interaction:click'
  | 'interaction:input'
  | 'viewer:joined'
  | 'viewer:left';

export interface CanvasEvent {
  type: CanvasEventType;
  sessionId: string;
  objectId?: string;
  data?: unknown;
  timestamp: string;
}

export interface CanvasSnapshot {
  sessionId: string;
  objects: CanvasObject[];
  width: number;
  height: number;
  takenAt: string;
}

export interface ViewerInfo {
  id: string;
  name?: string;
  joinedAt: string;
}
