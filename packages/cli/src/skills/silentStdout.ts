/** Stdout sink that discards writes (used when syncing skills during normal CLI commands). */
export const silentStdout: { write: (chunk: string) => void } = {
  write: () => {},
};
