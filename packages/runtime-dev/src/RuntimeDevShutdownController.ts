import type { Logger } from "@codemation/host/next/server";
import type { RuntimeDevHost } from "./RuntimeDevHost";

type RuntimeDevSignal = "SIGINT" | "SIGTERM" | "SIGQUIT";

type RuntimeDevSignalProcess = Readonly<{
  on(signal: RuntimeDevSignal, listener: () => void): void;
  exit(code?: number): void;
}>;

type ClosableServer = Readonly<{
  close(callback?: (error?: Error) => void): unknown;
}>;

export class RuntimeDevShutdownController {
  private stoppingPromise: Promise<void> | null = null;

  constructor(
    private readonly host: Pick<RuntimeDevHost, "stop">,
    private readonly server: ClosableServer,
    private readonly logger: Logger,
  ) {}

  bindSignals(signalProcess: RuntimeDevSignalProcess = process): void {
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      signalProcess.on(signal, () => {
        void this.stopAndExit(signalProcess, signal);
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.stoppingPromise) {
      this.stoppingPromise = this.stopInternal();
    }
    return await this.stoppingPromise;
  }

  private async stopAndExit(signalProcess: RuntimeDevSignalProcess, signal: RuntimeDevSignal): Promise<void> {
    try {
      await this.stop();
    } catch (error) {
      this.logger.error(`failed to stop runtime-dev after ${signal}`, this.normalizeError(error));
    } finally {
      signalProcess.exit(0);
    }
  }

  private async stopInternal(): Promise<void> {
    const failures: Error[] = [];
    try {
      await this.closeServer();
    } catch (error) {
      const exception = this.normalizeError(error);
      this.logger.error("failed to close runtime-dev HTTP server", exception);
      failures.push(exception);
    }
    try {
      await this.host.stop();
    } catch (error) {
      const exception = this.normalizeError(error);
      this.logger.error("failed to stop runtime-dev host", exception);
      failures.push(exception);
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  }

  private closeServer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
