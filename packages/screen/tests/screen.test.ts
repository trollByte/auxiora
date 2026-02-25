import { describe, it, expect, beforeEach } from 'vitest';
import { ScreenCapturer } from '../src/capture.js';
import { OCREngine } from '../src/ocr.js';
import { DesktopAutomation } from '../src/automation.js';
import { ScreenAnalyzer } from '../src/analyzer.js';
import type { CaptureBackend, VisionBackend, ScreenCapture } from '../src/types.js';
import type { AutomationBackend } from '../src/automation.js';
import { TrustEngine, TrustGate } from '@auxiora/autonomy';

// --- Mock backends ---

function createMockCapture(width = 1920, height = 1080): ScreenCapture {
  return {
    image: Buffer.from('mock-png-data'),
    timestamp: Date.now(),
    dimensions: { width, height },
  };
}

function createMockCaptureBackend(): CaptureBackend {
  return {
    captureScreen: async () => createMockCapture(),
    captureRegion: async (bounds) => createMockCapture(bounds.width, bounds.height),
    captureWindow: async (_title) => createMockCapture(800, 600),
  };
}

function createMockVisionBackend(response: string): VisionBackend {
  return {
    analyzeImage: async (_image, _prompt) => response,
  };
}

function createMockAutomationBackend(): AutomationBackend & { calls: Array<{ method: string; args: any[] }> } {
  const calls: Array<{ method: string; args: any[] }> = [];
  return {
    calls,
    click: async (x, y, button, clickCount) => { calls.push({ method: 'click', args: [x, y, button, clickCount] }); },
    typeText: async (text) => { calls.push({ method: 'typeText', args: [text] }); },
    keypress: async (key) => { calls.push({ method: 'keypress', args: [key] }); },
    scroll: async (dx, dy) => { calls.push({ method: 'scroll', args: [dx, dy] }); },
  };
}

// --- Tests ---

describe('ScreenCapturer', () => {
  let capturer: ScreenCapturer;

  beforeEach(() => {
    capturer = new ScreenCapturer(createMockCaptureBackend());
  });

  it('should capture the full screen', async () => {
    const result = await capturer.captureScreen();
    expect(result.dimensions.width).toBe(1920);
    expect(result.dimensions.height).toBe(1080);
    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('should capture a region', async () => {
    const result = await capturer.captureRegion({ x: 0, y: 0, width: 400, height: 300 });
    expect(result.dimensions.width).toBe(400);
    expect(result.dimensions.height).toBe(300);
  });

  it('should capture a window by title', async () => {
    const result = await capturer.captureWindow('Terminal');
    expect(result.dimensions.width).toBe(800);
    expect(result.dimensions.height).toBe(600);
  });

  it('should reject empty window title', async () => {
    await expect(capturer.captureWindow('')).rejects.toThrow('must not be empty');
  });

  it('should reject when capture is disabled', async () => {
    const disabled = new ScreenCapturer(createMockCaptureBackend(), { captureEnabled: false });
    await expect(disabled.captureScreen()).rejects.toThrow('disabled');
  });

  it('should reject region exceeding max dimensions', async () => {
    const small = new ScreenCapturer(createMockCaptureBackend(), { maxCaptureWidth: 100, maxCaptureHeight: 100 });
    await expect(small.captureRegion({ x: 0, y: 0, width: 200, height: 50 })).rejects.toThrow('exceeds max');
  });

  it('should return config', () => {
    const config = capturer.getConfig();
    expect(config.captureEnabled).toBe(true);
    expect(config.maxCaptureWidth).toBe(3840);
  });
});

describe('OCREngine', () => {
  it('should extract text from vision response', async () => {
    const vision = createMockVisionBackend(
      'Hello World|||10,20,200,30|||0.95\nSecond Line|||10,60,200,25|||0.88'
    );
    const ocr = new OCREngine(vision);
    const result = await ocr.extractText(Buffer.from('img'));

    expect(result.text).toBe('Hello World\nSecond Line');
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].text).toBe('Hello World');
    expect(result.regions[0].bounds.x).toBe(10);
    expect(result.regions[0].confidence).toBe(0.95);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should handle empty vision response', async () => {
    const vision = createMockVisionBackend('');
    const ocr = new OCREngine(vision);
    const result = await ocr.extractText(Buffer.from('img'));

    expect(result.text).toBe('');
    expect(result.regions).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('should find elements from vision response', async () => {
    const vision = createMockVisionBackend(
      'button|||50,100,120,40|||Submit|||true\ntext|||50,150,200,20|||Welcome|||false'
    );
    const ocr = new OCREngine(vision);
    const elements = await ocr.findElements(Buffer.from('img'));

    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('button');
    expect(elements[0].text).toBe('Submit');
    expect(elements[0].interactable).toBe(true);
    expect(elements[1].type).toBe('text');
    expect(elements[1].interactable).toBe(false);
  });
});

describe('DesktopAutomation', () => {
  let backend: ReturnType<typeof createMockAutomationBackend>;
  let automation: DesktopAutomation;
  let engine: TrustEngine;

  beforeEach(async () => {
    backend = createMockAutomationBackend();
    engine = new TrustEngine({ defaultLevel: 3 });
    await engine.load();
    const gate = new TrustGate(engine);
    automation = new DesktopAutomation(backend, gate, { automationEnabled: true });
  });

  it('should click at coordinates', async () => {
    const result = await automation.click(100, 200);
    expect(result.success).toBe(true);
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0].method).toBe('click');
    expect(backend.calls[0].args[0]).toBe(100);
    expect(backend.calls[0].args[1]).toBe(200);
  });

  it('should type text', async () => {
    const result = await automation.type('hello');
    expect(result.success).toBe(true);
    expect(backend.calls[0].method).toBe('typeText');
    expect(backend.calls[0].args[0]).toBe('hello');
  });

  it('should press keys', async () => {
    const result = await automation.keypress('Control+C');
    expect(result.success).toBe(true);
    expect(backend.calls[0].method).toBe('keypress');
  });

  it('should scroll', async () => {
    const result = await automation.scroll(0, -120);
    expect(result.success).toBe(true);
    expect(backend.calls[0].method).toBe('scroll');
  });

  it('should deny when automation is disabled', async () => {
    const gate = new TrustGate(engine);
    const disabled = new DesktopAutomation(backend, gate, { automationEnabled: false });
    const result = await disabled.click(10, 20);
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  });

  it('should deny when trust level is insufficient', async () => {
    const lowEngine = new TrustEngine({ defaultLevel: 0 });
    await lowEngine.load();
    const gate = new TrustGate(lowEngine);
    const restricted = new DesktopAutomation(backend, gate, { automationEnabled: true });
    const result = await restricted.click(10, 20);
    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');
  });

  it('should require text for type action', async () => {
    const result = await automation.execute({ type: 'type', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires text');
  });

  it('should require key for keypress action', async () => {
    const result = await automation.execute({ type: 'keypress', params: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires key');
  });
});

describe('ScreenAnalyzer', () => {
  it('should analyze screen with default prompt', async () => {
    const vision = createMockVisionBackend('A code editor is open with TypeScript code visible.');
    const analyzer = new ScreenAnalyzer(vision);
    const result = await analyzer.analyzeScreen(Buffer.from('img'));
    expect(result).toContain('code editor');
  });

  it('should analyze screen with a question', async () => {
    const vision = createMockVisionBackend('The browser tab shows google.com');
    const analyzer = new ScreenAnalyzer(vision);
    const result = await analyzer.analyzeScreen(Buffer.from('img'), 'What website is open?');
    expect(result).toContain('google.com');
  });
});
