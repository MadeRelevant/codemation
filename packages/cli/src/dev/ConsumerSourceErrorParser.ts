export interface ConsumerSourceErrorDetails {
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

/**
 * Extracts a structured `{ message, file?, line?, column? }` from a thrown error during
 * consumer-code import (typically thrown by the `tsx` ESM loader on syntax / type / runtime
 * errors in workflow files). Falls back to `{ message }` only when extraction fails — never
 * throws.
 */
export class ConsumerSourceErrorParser {
  parse(error: unknown): ConsumerSourceErrorDetails {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? (error.stack ?? "") : "";
    // tsx synthetic frames look like: `at file:///abs/path/foo.ts:12:5`
    // Plain Node frames: `at fn (/abs/path/foo.ts:12:5)`
    const match = stack.match(/(?:file:\/\/)?(\/[^\s:()]+\.[a-zA-Z]+):(\d+):(\d+)/);
    if (!match) {
      return { message };
    }
    const file = match[1];
    const line = Number.parseInt(match[2] ?? "", 10);
    const column = Number.parseInt(match[3] ?? "", 10);
    return {
      message,
      ...(file !== undefined ? { file } : {}),
      ...(Number.isFinite(line) ? { line } : {}),
      ...(Number.isFinite(column) ? { column } : {}),
    };
  }
}
