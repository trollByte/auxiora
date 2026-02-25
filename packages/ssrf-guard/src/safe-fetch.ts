import { SSRFError, type ValidatorOptions } from './types.js';
import { validateUrl } from './validate.js';

export async function safeFetch(
  url: string,
  init?: RequestInit,
  options?: ValidatorOptions,
): Promise<Response> {
  const error = validateUrl(url, options);
  if (error) {
    throw new SSRFError(url, error);
  }
  return fetch(url, init);
}
