import { describe, expect, it } from "vitest";

import { CodemationNextHost } from "../../src/server/CodemationNextHost";

describe("CodemationNextHost.shared", () => {
  it("returns the same singleton instance on every access", () => {
    const first = CodemationNextHost.shared;
    const second = CodemationNextHost.shared;
    expect(second).toBe(first);
  });
});
