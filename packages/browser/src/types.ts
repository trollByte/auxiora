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

export const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:'];

export const PRIVATE_IP_RANGES = [
  '127.',
  '10.',
  '192.168.',
  '169.254.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '0.0.0.0',
  '::1',
  'localhost',
];

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
