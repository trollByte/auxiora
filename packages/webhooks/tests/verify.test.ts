import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyHmacSha256, verifyTwilioSignature } from '../src/verify.js';

describe('verifyHmacSha256', () => {
  const secret = 'my-webhook-secret';

  it('should accept valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"event":"push"}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, signature)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const body = Buffer.from('{"event":"push"}');
    expect(verifyHmacSha256(body, secret, 'invalid-signature')).toBe(false);
  });

  it('should reject tampered body', () => {
    const body = Buffer.from('{"event":"push"}');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const tampered = Buffer.from('{"event":"hack"}');
    expect(verifyHmacSha256(tampered, secret, signature)).toBe(false);
  });

  it('should handle sha256= prefix in signature', () => {
    const body = Buffer.from('test');
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(body, secret, `sha256=${hash}`)).toBe(true);
  });

  it('should reject empty signature', () => {
    const body = Buffer.from('test');
    expect(verifyHmacSha256(body, secret, '')).toBe(false);
  });
});

describe('verifyTwilioSignature', () => {
  const authToken = 'twilio-auth-token';

  it('should accept valid Twilio signature', () => {
    const url = 'https://example.com/api/v1/webhooks/twilio';
    const params: Record<string, string> = {
      Body: 'Hello',
      From: '+1234567890',
      To: '+0987654321',
    };

    // Build expected signature the Twilio way:
    // Sort params by key, concatenate key+value, append to URL, HMAC-SHA1, base64
    const data = url + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
    const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

    expect(verifyTwilioSignature(url, params, authToken, expected)).toBe(true);
  });

  it('should reject invalid Twilio signature', () => {
    expect(verifyTwilioSignature('https://example.com', {}, authToken, 'bad-sig')).toBe(false);
  });
});
