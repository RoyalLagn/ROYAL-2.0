import { clipsConfig } from "../config";

export async function withClipRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (error: unknown) => boolean = () => true,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= clipsConfig.retry.maximumAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === clipsConfig.retry.maximumAttempts) break;
      const delay = Math.min(
        clipsConfig.retry.initialDelayMs * (2 ** (attempt - 1)),
        clipsConfig.retry.maximumDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
