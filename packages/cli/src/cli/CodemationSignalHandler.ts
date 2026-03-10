import process from "node:process";

export class CodemationSignalHandler {
  bind(stop: () => Promise<void>): void {
    process.on("SIGINT", () => {
      void stop();
    });
    process.on("SIGTERM", () => {
      void stop();
    });
    process.on("SIGQUIT", () => {
      void stop();
    });
  }
}
