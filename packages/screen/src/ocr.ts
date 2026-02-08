import type { OCRResult, ScreenElement, VisionBackend } from './types.js';

/**
 * OCR engine that uses a vision model to extract text and detect UI elements.
 */
export class OCREngine {
  private vision: VisionBackend;

  constructor(vision: VisionBackend) {
    this.vision = vision;
  }

  /** Extract text from an image using the vision model. */
  async extractText(image: Buffer): Promise<OCRResult> {
    const response = await this.vision.analyzeImage(
      image,
      'Extract all visible text from this screenshot. Return the text content organized by position, ' +
      'from top-left to bottom-right. For each distinct text block, provide the text and its approximate ' +
      'position as a percentage of the image dimensions (x%, y%, width%, height%). ' +
      'Format: TEXT|||x,y,w,h|||confidence\nOne per line.'
    );

    return this.parseTextResponse(response);
  }

  /** Find UI elements in an image using the vision model. */
  async findElements(image: Buffer): Promise<ScreenElement[]> {
    const response = await this.vision.analyzeImage(
      image,
      'Identify all UI elements in this screenshot. For each element, provide:\n' +
      '- type (button, input, link, text, image, icon, checkbox, dropdown, menu, tab)\n' +
      '- approximate bounding box as percentages (x%, y%, width%, height%)\n' +
      '- visible text or label\n' +
      '- whether it appears interactable (true/false)\n' +
      'Format: type|||x,y,w,h|||text|||interactable\nOne per line.'
    );

    return this.parseElementsResponse(response);
  }

  private parseTextResponse(response: string): OCRResult {
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    const regions: OCRResult['regions'] = [];
    let totalConfidence = 0;

    for (const line of lines) {
      const parts = line.split('|||').map(s => s.trim());
      if (parts.length < 2) continue;

      const text = parts[0];
      const boundsStr = parts[1];
      const confidence = parts[2] ? parseFloat(parts[2]) : 0.8;

      const coords = boundsStr.split(',').map(s => parseFloat(s.trim()));
      if (coords.length < 4 || coords.some(n => isNaN(n))) continue;

      regions.push({
        text,
        bounds: {
          x: Math.round(coords[0]),
          y: Math.round(coords[1]),
          width: Math.round(coords[2]),
          height: Math.round(coords[3]),
        },
        confidence: isNaN(confidence) ? 0.8 : Math.max(0, Math.min(1, confidence)),
      });
      totalConfidence += confidence;
    }

    const fullText = regions.map(r => r.text).join('\n');
    const avgConfidence = regions.length > 0 ? totalConfidence / regions.length : 0;

    return {
      text: fullText,
      regions,
      confidence: Math.max(0, Math.min(1, avgConfidence)),
    };
  }

  private parseElementsResponse(response: string): ScreenElement[] {
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    const elements: ScreenElement[] = [];

    for (const line of lines) {
      const parts = line.split('|||').map(s => s.trim());
      if (parts.length < 4) continue;

      const type = parts[0];
      const boundsStr = parts[1];
      const text = parts[2] || undefined;
      const interactable = parts[3] === 'true';

      const coords = boundsStr.split(',').map(s => parseFloat(s.trim()));
      if (coords.length < 4 || coords.some(n => isNaN(n))) continue;

      elements.push({
        type,
        bounds: {
          x: Math.round(coords[0]),
          y: Math.round(coords[1]),
          width: Math.round(coords[2]),
          height: Math.round(coords[3]),
        },
        text,
        interactable,
      });
    }

    return elements;
  }
}
