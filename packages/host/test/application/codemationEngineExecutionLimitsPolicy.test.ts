import assert from "node:assert/strict";
import { test } from "vitest";

import { CoreTokens, EngineExecutionLimitsPolicy } from "@codemation/core";

import { CodemationApplication } from "../../src/codemationApplication";
import { openAiApiKeyCredentialType } from "../../src/credentials";

test("runtime.engineExecutionLimits is merged into the DI-resolved policy", () => {
  const app = new CodemationApplication();
  app.useRuntimeConfig({
    engineExecutionLimits: {
      defaultMaxNodeActivations: 99,
      hardMaxNodeActivations: 99,
      defaultMaxSubworkflowDepth: 5,
      hardMaxSubworkflowDepth: 5,
    },
  });
  const p = app.getContainer().resolve(CoreTokens.EngineExecutionLimitsPolicy);
  const o = p.mergeExecutionOptionsForNewRun(undefined, undefined);
  assert.equal(o.maxNodeActivations, 99);
  assert.equal(o.maxSubworkflowDepth, 5);
});

test("register(context) can replace CoreTokens.EngineExecutionLimitsPolicy", () => {
  const custom = new EngineExecutionLimitsPolicy({
    defaultMaxNodeActivations: 7,
    hardMaxNodeActivations: 7,
    defaultMaxSubworkflowDepth: 32,
    hardMaxSubworkflowDepth: 32,
  });
  const app = new CodemationApplication();
  app.useConfig({
    runtime: {
      engineExecutionLimits: {
        hardMaxNodeActivations: 1,
        defaultMaxNodeActivations: 1,
      },
    },
    register(context) {
      context.registerValue(CoreTokens.EngineExecutionLimitsPolicy, custom);
    },
  });
  const p = app.getContainer().resolve(CoreTokens.EngineExecutionLimitsPolicy);
  assert.strictEqual(p, custom);
  const o = p.mergeExecutionOptionsForNewRun(undefined, undefined);
  assert.equal(o.maxNodeActivations, 7);
});

test("useConfig does not duplicate framework credential types already provided by config", () => {
  const app = new CodemationApplication();

  app.useConfig({
    credentialTypes: [openAiApiKeyCredentialType],
  });

  assert.doesNotThrow(() => app.getContainer());
});
