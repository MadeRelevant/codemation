import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { AuthJsLogger } from "../src/auth/AuthJsLogger";

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

test("AuthJsLogger suppresses stale cookie JWT secret mismatch noise", () => {
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  const logger = new AuthJsLogger().logger;
  const error = Object.assign(new Error("Read more at https://errors.authjs.dev#jwtsessionerror"), {
    type: "JWTSessionError",
    cause: {
      err: new Error("no matching decryption secret"),
    },
  });

  logger.error?.(error);

  assert.deepEqual(calls, []);
});

test("AuthJsLogger still logs unexpected auth errors", () => {
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  const logger = new AuthJsLogger().logger;
  const error = Object.assign(new Error("Read more at https://errors.authjs.dev#jwtsessionerror"), {
    name: "JWTSessionError",
    type: "JWTSessionError",
    cause: {
      err: new Error("malformed token"),
    },
  });

  logger.error?.(error);

  assert.equal(calls.length, 4);
  assert.equal(calls[0]?.[0], "[auth][error] JWTSessionError: Read more at https://errors.authjs.dev#jwtsessionerror");
  assert.equal(calls[1]?.[0], "[auth][cause]: Error: malformed token");
  assert.match(String(calls[2]?.[0]), /Error: malformed token/);
  assert.equal(calls[3]?.[0], "[auth][details]: {}");
});
