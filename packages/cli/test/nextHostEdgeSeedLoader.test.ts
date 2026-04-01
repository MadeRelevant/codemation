import assert from "node:assert/strict";
import { test } from "vitest";

import { NextHostEdgeSeedLoader } from "../src/dev/NextHostEdgeSeedLoader";

test("NextHostEdgeSeedLoader falls back to the shared development auth secret", () => {
  const loader = new NextHostEdgeSeedLoader(
    { load: async () => ({ config: {}, bootstrapSource: null, workflowSources: [] }) } as never,
    {
      mergeConsumerRootIntoProcessEnvironment: () => ({ NODE_ENV: "development" }),
    } as never,
  );

  assert.equal(
    loader.resolveDevelopmentAuthSecret({ NODE_ENV: "development" }),
    NextHostEdgeSeedLoader.defaultDevelopmentAuthSecret,
  );
});
