export interface AsyncSleeper {
  sleep(ms: number): Promise<void>;
}
