export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  navigationTimeout: number;
  actionTimeout: number;
  maxConcurrentPages: number;
  screenshotDir: string;
  allowedUrls?: string[];
  blockedUrls?: string[];
}

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: true,
  viewport: { width: 1280, height: 720 },
  navigationTimeout: 30_000,
  actionTimeout: 10_000,
  maxConcurrentPages: 10,
  screenshotDir: 'screenshots',
};

export { BLOCKED_PROTOCOLS } from '@auxiora/ssrf-guard';

export interface PageInfo {
  url: string;
  title: string;
  content?: string;
}

export interface BrowseStep {
  action: string;
  params: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  quality?: number;
}

export interface ExtractResult {
  selector: string;
  elements: Array<{
    text: string;
    attributes: Record<string, string>;
    tagName: string;
  }>;
}
