import { describe, it, expect } from 'vitest';
import {
  trapAsync,
  trapSync,
  extractErrorMessage,
  hasStatusCode,
  isError,
  wrapPromise,
  chainResults,
  combineResults,
  retryOperation,
  ok,
  err,
  Result,
} from './index.js';

describe('Error Service', () => {
  describe('trapAsync', () => {
    it('should return ok result for successful async operations', async () => {
      const result = await trapAsync(
        async () => 'success',
        (error) => ({ message: extractErrorMessage(error) }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should return error result for failed async operations', async () => {
      const result = await trapAsync(
        async () => {
          throw new Error('async failure');
        },
        (error) => ({ message: extractErrorMessage(error) }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('async failure');
      }
    });

    it('should handle non-Error exceptions', async () => {
      const result = await trapAsync(
        async () => {
          throw 'string error';
        },
        (error) => ({ message: extractErrorMessage(error) }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('string error');
      }
    });
  });

  describe('trapSync', () => {
    it('should return ok result for successful sync operations', () => {
      const result = trapSync(
        () => 'success',
        (error) => ({ message: extractErrorMessage(error) }),
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should return error result for failed sync operations', () => {
      const result = trapSync(
        () => {
          throw new Error('sync failure');
        },
        (error) => ({ message: extractErrorMessage(error) }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('sync failure');
      }
    });
  });

  describe('extractErrorMessage', () => {
    it('should extract message from Error instances', () => {
      const error = new Error('test error');
      expect(extractErrorMessage(error)).toBe('test error');
    });

    it('should handle string errors', () => {
      expect(extractErrorMessage('string error')).toBe('string error');
    });

    it('should handle objects with message property', () => {
      const error = { message: 'object error' };
      expect(extractErrorMessage(error)).toBe('object error');
    });

    it('should handle null and undefined', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error occurred');
      expect(extractErrorMessage(undefined)).toBe('Unknown error occurred');
    });

    it('should handle objects without message property', () => {
      expect(extractErrorMessage({})).toBe('Unknown error occurred');
      expect(extractErrorMessage({ code: 'ERROR' })).toBe('Unknown error occurred');
    });
  });

  describe('hasStatusCode', () => {
    it('should detect status property', () => {
      const error = { status: 404 };
      expect(hasStatusCode(error, 404)).toBe(true);
      expect(hasStatusCode(error, 500)).toBe(false);
    });

    it('should detect statusCode property', () => {
      const error = { statusCode: 401 };
      expect(hasStatusCode(error, 401)).toBe(true);
      expect(hasStatusCode(error, 403)).toBe(false);
    });

    it('should handle errors without status codes', () => {
      expect(hasStatusCode(new Error('test'), 404)).toBe(false);
      expect(hasStatusCode('string error', 404)).toBe(false);
      expect(hasStatusCode(null, 404)).toBe(false);
    });
  });

  describe('isError', () => {
    it('should identify Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError(new RangeError('test'))).toBe(true);
    });

    it('should reject non-Error values', () => {
      expect(isError('string')).toBe(false);
      expect(isError(123)).toBe(false);
      expect(isError({})).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });
  });

  describe('wrapPromise', () => {
    it('should wrap successful promises', async () => {
      const promise = Promise.resolve('success');
      const result = await wrapPromise(promise, (error) => ({ message: extractErrorMessage(error) }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should wrap rejected promises', async () => {
      const promise = Promise.reject(new Error('rejection'));
      const result = await wrapPromise(promise, (error) => ({ message: extractErrorMessage(error) }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('rejection');
      }
    });
  });

  describe('chainResults', () => {
    it('should chain successful operations', async () => {
      const result = await chainResults(1, [
        async (n: number): Promise<Result<number, string>> => ok(n + 1),
        async (n: number): Promise<Result<number, string>> => ok(n * 2),
        async (n: number): Promise<Result<number, string>> => ok(n + 10),
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(14); // (1 + 1) * 2 + 10
      }
    });

    it('should short-circuit on first error', async () => {
      const result = await chainResults(1, [
        async (n: number): Promise<Result<number, string>> => ok(n + 1),
        async (): Promise<Result<number, string>> => err('operation failed'),
        async (n: number): Promise<Result<number, string>> => ok(n + 10),
      ]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('operation failed');
      }
    });

    it('should handle empty operations array', async () => {
      const result = await chainResults(42, []);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('combineResults', () => {
    it('should combine all successful results', () => {
      const results = [ok('first'), ok('second'), ok('third')];

      const combined = combineResults(results);

      expect(combined.ok).toBe(true);
      if (combined.ok) {
        expect(combined.value).toEqual(['first', 'second', 'third']);
      }
    });

    it('should return first error encountered', () => {
      const results = [ok('first'), err('error occurred'), ok('third')];

      const combined = combineResults(results);

      expect(combined.ok).toBe(false);
      if (!combined.ok) {
        expect(combined.error).toBe('error occurred');
      }
    });

    it('should handle empty array', () => {
      const combined = combineResults([]);

      expect(combined.ok).toBe(true);
      if (combined.ok) {
        expect(combined.value).toEqual([]);
      }
    });
  });

  describe('retryOperation', () => {
    it('should return success on first try', async () => {
      let attempts = 0;
      const result = await retryOperation(
        async () => {
          attempts++;
          return ok('success');
        },
        3,
        10,
      );

      expect(result.ok).toBe(true);
      expect(attempts).toBe(1);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const result = await retryOperation(
        async () => {
          attempts++;
          if (attempts < 3) {
            return err('temporary failure');
          }
          return ok('success');
        },
        3,
        10,
      );

      expect(result.ok).toBe(true);
      expect(attempts).toBe(3);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });

    it('should return error after max retries', async () => {
      let attempts = 0;
      const result = await retryOperation(
        async () => {
          attempts++;
          return err('persistent failure');
        },
        2,
        10,
      );

      expect(result.ok).toBe(false);
      expect(attempts).toBe(3); // initial + 2 retries
      if (!result.ok) {
        expect(result.error).toBe('persistent failure');
      }
    });

    it('should respect delay between retries', async () => {
      const start = Date.now();
      let attempts = 0;

      await retryOperation(
        async () => {
          attempts++;
          return err('failure');
        },
        2,
        50,
      );

      const duration = Date.now() - start;
      expect(attempts).toBe(3);
      expect(duration).toBeGreaterThanOrEqual(100); // 2 retries * 50ms
    });
  });
});
