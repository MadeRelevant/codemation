export class Eventually {
  static async waitFor<T>(
    probe: () => Promise<T>,
    accept: (value: T) => boolean | Promise<boolean>,
    timeoutMs: number,
    intervalMs: number,
    failureMessage: string,
  ): Promise<T> {
    const deadline = performance.now() + timeoutMs;
    let lastError: unknown = null;
    while (performance.now() < deadline) {
      try {
        const value = await probe();
        if (await accept(value)) {
          return value;
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const suffix =
      lastError instanceof Error
        ? ` Last error: ${lastError.message}`
        : lastError
          ? ` Last error: ${String(lastError)}`
          : "";
    throw new Error(`${failureMessage}.${suffix}`);
  }
}
