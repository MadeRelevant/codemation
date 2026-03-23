import assert from "node:assert/strict";
import { test } from "vitest";

import { DevelopmentRuntimeRouteGuard } from "@codemation/host/dev-server-sidecar";

test("isAuthorized allows loopback hosts without a token", () => {
  assert.equal(DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://127.0.0.1/dev/runtime")), true);
  assert.equal(DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://localhost:9999/dev/runtime")), true);
  assert.equal(DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://[::1]:3000/dev/runtime")), true);
});

test("isAuthorized requires x-codemation-dev-token when CODEMATION_DEV_SERVER_TOKEN is set", () => {
  const previous = process.env.CODEMATION_DEV_SERVER_TOKEN;
  process.env.CODEMATION_DEV_SERVER_TOKEN = "secret-token";
  try {
    assert.equal(
      DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://127.0.0.1/dev/runtime", { headers: { "x-codemation-dev-token": "secret-token" } })),
      true,
    );
    assert.equal(DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://127.0.0.1/dev/runtime")), true);
    assert.equal(DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://example.com/dev/runtime")), false);
    assert.equal(
      DevelopmentRuntimeRouteGuard.isAuthorized(new Request("http://example.com/dev/runtime", { headers: { "x-codemation-dev-token": "wrong" } })),
      false,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.CODEMATION_DEV_SERVER_TOKEN;
    } else {
      process.env.CODEMATION_DEV_SERVER_TOKEN = previous;
    }
  }
});

test("parseSignalFromPayload maps build lifecycle payloads", () => {
  assert.deepEqual(DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildStarted", buildVersion: "v1" }), {
    kind: "buildStarted",
    buildVersion: "v1",
  });
  assert.deepEqual(DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildCompleted", buildVersion: "v2" }), {
    kind: "buildCompleted",
    buildVersion: "v2",
  });
  assert.deepEqual(DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildFailed", message: "x" }), {
    kind: "buildFailed",
    message: "x",
  });
});

test("parseSignalFromPayload rejects unsupported payloads", () => {
  assert.throws(() => DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildFailed", message: "" }), /Unsupported/);
  assert.throws(() => DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "unknown" }), /Unsupported/);
});
