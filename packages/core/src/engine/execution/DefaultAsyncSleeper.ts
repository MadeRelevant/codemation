import type { AsyncSleeper } from "./asyncSleeper.types";

export class DefaultAsyncSleeper implements AsyncSleeper {
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
