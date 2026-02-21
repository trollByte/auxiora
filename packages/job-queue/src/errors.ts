export class NonRetryableError extends Error {
  override readonly name = 'NonRetryableError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
