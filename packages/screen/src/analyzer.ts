import type { VisionBackend } from './types.js';

/**
 * Screen analyzer — sends screenshots to a vision model for analysis.
 */
export class ScreenAnalyzer {
  private vision: VisionBackend;

  constructor(vision: VisionBackend) {
    this.vision = vision;
  }

  /**
   * Analyze a screenshot, optionally answering a specific question about it.
   * @param image - PNG screenshot buffer.
   * @param question - Optional question to answer about the screen content.
   * @returns Natural language analysis of the screen.
   */
  async analyzeScreen(image: Buffer, question?: string): Promise<string> {
    const prompt = question
      ? `Look at this screenshot and answer: ${question}`
      : 'Describe what is visible on this screen. Include any visible text, UI elements, ' +
        'active applications, and notable content. Be concise but thorough.';

    return this.vision.analyzeImage(image, prompt);
  }
}
