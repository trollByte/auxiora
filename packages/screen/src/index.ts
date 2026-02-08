export type {
  ScreenBounds,
  ScreenCapture,
  OCRResult,
  OCRRegion,
  ScreenElement,
  DesktopAction,
  DesktopActionType,
  ScreenConfig,
  CaptureBackend,
  VisionBackend,
} from './types.js';
export { DEFAULT_SCREEN_CONFIG } from './types.js';
export { ScreenCapturer } from './capture.js';
export { OCREngine } from './ocr.js';
export { DesktopAutomation, type AutomationResult, type AutomationBackend } from './automation.js';
export { ScreenAnalyzer } from './analyzer.js';
