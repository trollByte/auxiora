import { describe, it, expect } from 'vitest';

describe('Screen package exports', () => {
  it('should export all public APIs', async () => {
    const mod = await import('../src/index.js');
    expect(mod.ScreenCapturer).toBeDefined();
    expect(mod.OCREngine).toBeDefined();
    expect(mod.DesktopAutomation).toBeDefined();
    expect(mod.ScreenAnalyzer).toBeDefined();
    expect(mod.DEFAULT_SCREEN_CONFIG).toBeDefined();
  });
});
