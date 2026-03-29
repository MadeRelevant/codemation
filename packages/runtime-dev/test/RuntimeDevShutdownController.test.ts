import assert from "node:assert/strict";
import { test } from "vitest";
import { RuntimeDevShutdownController } from "../src/RuntimeDevShutdownController";

class TestRuntimeDevHost {
  stopCallCount = 0;
  async stop(): Promise<void> {
    this.stopCallCount += 1;
  }
}

class TestClosableServer {
  closeCallCount = 0;
  constructor(private readonly closeError?: Error) {}

  close(callback: (error?: Error) => void): void {
    this.closeCallCount += 1;
    callback(this.closeError);
  }
}

class TestLogger {
  readonly errors: string[] = [];

  info(): void {}

  warn(): void {}

  error(message: string): void {
    this.errors.push(message);
  }

  debug(): void {}
}

class TestSignalProcess {
  private readonly listeners = new Map<string, () => void>();
  exitCode: number | null = null;

  on(signal: "SIGINT" | "SIGTERM" | "SIGQUIT", listener: () => void): void {
    this.listeners.set(signal, listener);
  }

  emit(signal: "SIGINT" | "SIGTERM" | "SIGQUIT"): void {
    const listener = this.listeners.get(signal);
    if (!listener) {
      throw new Error(`Missing listener for ${signal}`);
    }
    listener();
  }

  exit(code?: number): void {
    this.exitCode = code ?? 0;
  }
}

test("stop closes the HTTP server and host once", async () => {
  const host = new TestRuntimeDevHost();
  const server = new TestClosableServer();
  const logger = new TestLogger();
  const controller = new RuntimeDevShutdownController(host, server, logger);

  await Promise.all([controller.stop(), controller.stop()]);

  assert.equal(server.closeCallCount, 1);
  assert.equal(host.stopCallCount, 1);
  assert.deepEqual(logger.errors, []);
});

test("bindSignals stops the runtime and exits the process", async () => {
  const host = new TestRuntimeDevHost();
  const server = new TestClosableServer();
  const logger = new TestLogger();
  const signalProcess = new TestSignalProcess();
  const controller = new RuntimeDevShutdownController(host, server, logger);

  controller.bindSignals(signalProcess);
  signalProcess.emit("SIGTERM");
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      resolve();
    });
  });

  assert.equal(server.closeCallCount, 1);
  assert.equal(host.stopCallCount, 1);
  assert.equal(signalProcess.exitCode, 0);
});

test("stop still tries to stop the host when server close fails", async () => {
  const host = new TestRuntimeDevHost();
  const server = new TestClosableServer(new Error("close failed"));
  const logger = new TestLogger();
  const controller = new RuntimeDevShutdownController(host, server, logger);

  await assert.rejects(async () => {
    await controller.stop();
  }, /close failed/);

  assert.equal(server.closeCallCount, 1);
  assert.equal(host.stopCallCount, 1);
  assert.deepEqual(logger.errors, ["failed to close runtime-dev HTTP server"]);
});
