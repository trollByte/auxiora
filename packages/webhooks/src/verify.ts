import * as crypto from 'node:crypto';

/**
 * Verify HMAC-SHA256 signature using timing-safe comparison.
 * Handles optional "sha256=" prefix (GitHub style).
 */
export function verifyHmacSha256(body: Buffer, secret: string, signature: string): boolean {
  if (!signature) return false;

  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  let sigBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(body).digest();

  if (sigBuffer.length !== expected.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expected);
}

/**
 * Verify Twilio webhook signature (HMAC-SHA1, base64).
 * Twilio signs: URL + sorted(key+value pairs), HMAC-SHA1, base64.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  signature: string
): boolean {
  if (!signature) return false;

  const data = url + Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  const expected = crypto.createHmac('sha1', authToken).update(data).digest('base64');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}
