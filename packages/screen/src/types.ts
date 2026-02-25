/** Rectangular region on screen. */
export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A captured screenshot or region. */
export interface ScreenCapture {
  /** Raw image data (PNG). */
  image: Buffer;
  /** When the capture was taken. */
  timestamp: number;
  /** Pixel dimensions. */
  dimensions: { width: number; height: number };
}

/** Result of OCR text extraction. */
export interface OCRResult {
  /** Full extracted text. */
  text: string;
  /** Detected text regions with positions. */
  regions: OCRRegion[];
  /** Overall confidence score (0-1). */
  confidence: number;
}

/** A single region of detected text. */
export interface OCRRegion {
  text: string;
  bounds: ScreenBounds;
  confidence: number;
}

/** A UI element detected on screen. */
export interface ScreenElement {
  /** Element type (button, input, link, text, image, icon, etc.). */
  type: string;
  /** Bounding box on screen. */
  bounds: ScreenBounds;
  /** Visible text or label. */
  text?: string;
  /** Whether the element appears interactable. */
  interactable: boolean;
}

/** Types of desktop automation actions. */
export type DesktopActionType = 'click' | 'type' | 'scroll' | 'keypress';

/** A desktop automation action to perform. */
export interface DesktopAction {
  type: DesktopActionType;
  /** Target location or element description. */
  target?: { x: number; y: number } | string;
  /** Action-specific parameters. */
  params?: {
    /** Text to type (for 'type' action). */
    text?: string;
    /** Key combo to press (for 'keypress' action). */
    key?: string;
    /** Scroll delta (for 'scroll' action). */
    deltaX?: number;
    deltaY?: number;
    /** Mouse button (for 'click' action). */
    button?: 'left' | 'right' | 'middle';
    /** Number of clicks (for 'click' action). */
    clickCount?: number;
  };
}

/** Configuration for the screen system. */
export interface ScreenConfig {
  /** Whether screen capture is allowed. */
  captureEnabled: boolean;
  /** Whether OCR is enabled. */
  ocrEnabled: boolean;
  /** Whether desktop automation is enabled. */
  automationEnabled: boolean;
  /** Maximum capture width in pixels. */
  maxCaptureWidth: number;
  /** Maximum capture height in pixels. */
  maxCaptureHeight: number;
  /** Trust level required for screen capture. */
  captureRequiredTrust: number;
  /** Trust level required for automation actions. */
  automationRequiredTrust: number;
}

export const DEFAULT_SCREEN_CONFIG: ScreenConfig = {
  captureEnabled: true,
  ocrEnabled: true,
  automationEnabled: false,
  maxCaptureWidth: 3840,
  maxCaptureHeight: 2160,
  captureRequiredTrust: 2,
  automationRequiredTrust: 3,
};

/** Interface for capture backends (Tauri bridge, mock, etc.). */
export interface CaptureBackend {
  captureScreen(): Promise<ScreenCapture>;
  captureRegion(bounds: ScreenBounds): Promise<ScreenCapture>;
  captureWindow(title: string): Promise<ScreenCapture>;
}

/** Interface for vision model backend used by OCR and analyzer. */
export interface VisionBackend {
  analyzeImage(image: Buffer, prompt: string): Promise<string>;
}
