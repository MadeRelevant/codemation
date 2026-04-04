import { afterEach, describe, expect, it } from "vitest";

import { CodemationRuntimeUrlResolver } from "../../src/bootstrap/CodemationRuntimeUrlResolver";

describe("CodemationRuntimeUrlResolver", () => {
  const priorAuthUrl = process.env.AUTH_URL;
  const priorRuntimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL;
  const priorPort = process.env.PORT;

  afterEach(() => {
    if (priorAuthUrl === undefined) {
      delete process.env.AUTH_URL;
    } else {
      process.env.AUTH_URL = priorAuthUrl;
    }
    if (priorRuntimeDevUrl === undefined) {
      delete process.env.CODEMATION_RUNTIME_DEV_URL;
    } else {
      process.env.CODEMATION_RUNTIME_DEV_URL = priorRuntimeDevUrl;
    }
    if (priorPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = priorPort;
    }
  });

  it("uses CODEMATION_RUNTIME_DEV_URL when set", () => {
    process.env.CODEMATION_RUNTIME_DEV_URL = "http://127.0.0.1:3100";
    delete process.env.AUTH_URL;
    const resolver = new CodemationRuntimeUrlResolver();
    expect(resolver.resolve("/api/auth/session")).toBe("http://127.0.0.1:3100/api/auth/session");
  });

  it("uses AUTH_URL as the public base for host API paths (Better Auth surface)", () => {
    delete process.env.CODEMATION_RUNTIME_DEV_URL;
    process.env.AUTH_URL = "http://127.0.0.1:3000";
    const resolver = new CodemationRuntimeUrlResolver();
    expect(resolver.resolve("/api/auth/session")).toBe("http://127.0.0.1:3000/api/auth/session");
    expect(resolver.resolve("api/auth/sign-in/email")).toBe("http://127.0.0.1:3000/api/auth/sign-in/email");
  });
});
