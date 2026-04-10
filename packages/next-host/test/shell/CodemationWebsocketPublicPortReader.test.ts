import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationWebsocketPublicPortReader } from "../../src/shell/CodemationWebsocketPublicPortReader";

const keys = ["CODEMATION_PUBLIC_WS_PORT", "NEXT_PUBLIC_CODEMATION_WS_PORT", "CODEMATION_RUNTIME_DEV_URL"] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of keys) {
    const v = saved[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

test("prefers CODEMATION_PUBLIC_WS_PORT over runtime URL", () => {
  const prior = saveEnv();
  try {
    process.env.CODEMATION_PUBLIC_WS_PORT = "1111";
    process.env.NEXT_PUBLIC_CODEMATION_WS_PORT = "2222";
    process.env.CODEMATION_RUNTIME_DEV_URL = "http://127.0.0.1:3333";
    assert.equal(new CodemationWebsocketPublicPortReader().read(), "1111");
  } finally {
    restoreEnv(prior);
  }
});

test("falls back to NEXT_PUBLIC_CODEMATION_WS_PORT", () => {
  const prior = saveEnv();
  try {
    delete process.env.CODEMATION_PUBLIC_WS_PORT;
    process.env.NEXT_PUBLIC_CODEMATION_WS_PORT = "4444";
    delete process.env.CODEMATION_RUNTIME_DEV_URL;
    assert.equal(new CodemationWebsocketPublicPortReader().read(), "4444");
  } finally {
    restoreEnv(prior);
  }
});

test("derives port from CODEMATION_RUNTIME_DEV_URL when explicit WS port is unset", () => {
  const prior = saveEnv();
  try {
    delete process.env.CODEMATION_PUBLIC_WS_PORT;
    delete process.env.NEXT_PUBLIC_CODEMATION_WS_PORT;
    process.env.CODEMATION_RUNTIME_DEV_URL = "http://127.0.0.1:46853";
    assert.equal(new CodemationWebsocketPublicPortReader().read(), "46853");
  } finally {
    restoreEnv(prior);
  }
});
