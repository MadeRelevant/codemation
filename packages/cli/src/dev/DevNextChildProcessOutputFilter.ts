import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

import type { DevNextStartupBannerLineFilter } from "./DevNextStartupBannerLineFilter";

/**
 * Attaches to a spawned Next child process and forwards streams while dropping
 * {@link DevNextStartupBannerLineFilter} matches (startup banner only).
 */
export class DevNextChildProcessOutputFilter {
  constructor(private readonly lineFilter: DevNextStartupBannerLineFilter) {}

  attach(child: ChildProcess): void {
    this.pipeFilteredStream(child.stdout, process.stdout);
    this.pipeFilteredStream(child.stderr, process.stderr);
  }

  private pipeFilteredStream(source: NodeJS.ReadableStream | null, sink: NodeJS.WritableStream): void {
    if (!source) {
      return;
    }
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (this.lineFilter.shouldSuppress(line)) {
        return;
      }
      sink.write(`${line}\n`);
    });
  }
}
