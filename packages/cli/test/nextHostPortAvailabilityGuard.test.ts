import assert from "node:assert/strict";
import { test } from "vitest";

import { NextHostPortAvailabilityGuard } from "../src/dev/NextHostPortAvailabilityGuard";

class StubListenPortConflictDescriber {
  constructor(private readonly result: string | null) {}
  async describeLoopbackPort(): Promise<string | null> {
    return this.result;
  }
}

test("NextHostPortAvailabilityGuard: throws with pid details when loopback port is occupied", async () => {
  const guard = new NextHostPortAvailabilityGuard(
    new StubListenPortConflictDescriber("pid=4242 command=next-server endpoint=TCP 127.0.0.1:3000 (LISTEN)") as never,
  );
  await assert.rejects(
    () => guard.assertLoopbackPortAvailable(3000),
    (e) => e instanceof Error && e.message.includes("pid=4242") && e.message.includes("Next host port 3000"),
  );
});
