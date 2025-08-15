/**
 * Error handling utilities for converting exceptions to Result types
 */

/**
 * Result type for handling errors in a functional way
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Wraps an async function to catch exceptions and convert them to Result types
 * @param fn - The async function to wrap
 * @returns A Result containing the value or error
 */
export async function trapAsync<T, E>(fn: () => Promise<T>, errorMapper: (error: unknown) => E): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(errorMapper(error));
  }
}

/**
 * Wraps a sync function to catch exceptions and convert them to Result types
 * @param fn - The sync function to wrap
 * @returns A Result containing the value or error
 */
export function trapSync<T, E>(fn: () => T, errorMapper: (error: unknown) => E): Result<T, E> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    return err(errorMapper(error));
  }
}

/**
 * Extracts error message from unknown error types
 * @param error - The error to extract message from
 * @returns A string error message
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Checks if an error has a specific status code (useful for HTTP errors)
 * @param error - The error to check
 * @param statusCode - The status code to check for
 * @returns True if the error has the specified status code
 */
export function hasStatusCode(error: unknown, statusCode: number): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === statusCode;
  }
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode === statusCode;
  }
  return false;
}

/**
 * Type guard to check if error is an Error instance
 * @param error - The error to check
 * @returns True if the error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Wraps a Promise to convert rejections to Result types
 * @param promise - The promise to wrap
 * @param errorMapper - Function to map errors to the desired error type
 * @returns A Result containing the resolved value or mapped error
 */
export async function wrapPromise<T, E>(
  promise: Promise<T>,
  errorMapper: (error: unknown) => E,
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(errorMapper(error));
  }
}

/**
 * Chains multiple Result-returning operations, short-circuiting on first error
 * @param initial - The initial value
 * @param operations - Array of operations to chain
 * @returns The final Result
 */
export async function chainResults<T, E>(
  initial: T,
  operations: Array<(value: T) => Promise<Result<T, E>>>,
): Promise<Result<T, E>> {
  let current = initial;

  for (const operation of operations) {
    const result = await operation(current);
    if (!result.ok) {
      return result;
    }
    current = result.value;
  }

  return ok(current);
}

/**
 * Combines multiple Results into a single Result containing an array
 * @param results - Array of Results to combine
 * @returns A Result containing an array of values or the first error
 */
export function combineResults<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (!result.ok) {
      return err(result.error);
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Retry an operation that returns a Result
 * @param operation - The operation to retry
 * @param maxRetries - Maximum number of retries
 * @param delayMs - Delay between retries in milliseconds
 * @returns The Result from the operation
 */
export async function retryOperation<T, E>(
  operation: () => Promise<Result<T, E>>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<Result<T, E>> {
  let lastError: E | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const result = await operation();
    if (result.ok) {
      return result;
    }

    lastError = result.error;
  }

  return err(lastError!);
}
