export interface ValidatorOptions {
  allowedUrls?: string[];
  blockedUrls?: string[];
}

export const BLOCKED_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:'];

export class SSRFError extends Error {
  readonly url: string;
  readonly reason: string;

  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${reason} (${url})`);
    this.name = 'SSRFError';
    this.url = url;
    this.reason = reason;
  }
}
