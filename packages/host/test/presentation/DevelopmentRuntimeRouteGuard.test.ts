import { describe, expect, it } from "vitest";
import { DevelopmentRuntimeRouteGuard } from "../../src/presentation/server/DevelopmentRuntimeRouteGuard";

function makeRequest(url: string, devToken?: string): Request {
  const headers = new Headers();
  if (devToken !== undefined) {
    headers.set("x-codemation-dev-token", devToken);
  }
  return new Request(url, { headers });
}

describe("DevelopmentRuntimeRouteGuard.isAuthorized", () => {
  it("allows loopback 127.0.0.1 without token", () => {
    const request = makeRequest("http://127.0.0.1:4000/dev/signal");
    expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(true);
  });

  it("allows localhost without token", () => {
    const request = makeRequest("http://localhost:4000/dev/signal");
    expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(true);
  });

  it("allows ::1 (IPv6 loopback) without token", () => {
    const request = makeRequest("http://[::1]:4000/dev/signal");
    expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(true);
  });

  it("allows any origin when CODEMATION_DEV_SERVER_TOKEN is not set", () => {
    const original = process.env.CODEMATION_DEV_SERVER_TOKEN;
    delete process.env.CODEMATION_DEV_SERVER_TOKEN;
    try {
      const request = makeRequest("http://external.host:4000/dev/signal");
      expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(true);
    } finally {
      if (original !== undefined) process.env.CODEMATION_DEV_SERVER_TOKEN = original;
    }
  });

  it("allows external origin with matching token", () => {
    const original = process.env.CODEMATION_DEV_SERVER_TOKEN;
    process.env.CODEMATION_DEV_SERVER_TOKEN = "secret-token-123";
    try {
      const request = makeRequest("http://external.host:4000/dev/signal", "secret-token-123");
      expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(true);
    } finally {
      if (original !== undefined) {
        process.env.CODEMATION_DEV_SERVER_TOKEN = original;
      } else {
        delete process.env.CODEMATION_DEV_SERVER_TOKEN;
      }
    }
  });

  it("rejects external origin with wrong token", () => {
    const original = process.env.CODEMATION_DEV_SERVER_TOKEN;
    process.env.CODEMATION_DEV_SERVER_TOKEN = "secret-token-123";
    try {
      const request = makeRequest("http://external.host:4000/dev/signal", "wrong-token");
      expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(false);
    } finally {
      if (original !== undefined) {
        process.env.CODEMATION_DEV_SERVER_TOKEN = original;
      } else {
        delete process.env.CODEMATION_DEV_SERVER_TOKEN;
      }
    }
  });

  it("rejects external origin with no token when one is expected", () => {
    const original = process.env.CODEMATION_DEV_SERVER_TOKEN;
    process.env.CODEMATION_DEV_SERVER_TOKEN = "secret-token-123";
    try {
      const request = makeRequest("http://external.host:4000/dev/signal");
      expect(DevelopmentRuntimeRouteGuard.isAuthorized(request)).toBe(false);
    } finally {
      if (original !== undefined) {
        process.env.CODEMATION_DEV_SERVER_TOKEN = original;
      } else {
        delete process.env.CODEMATION_DEV_SERVER_TOKEN;
      }
    }
  });
});

describe("DevelopmentRuntimeRouteGuard.parseSignalFromPayload", () => {
  it("parses buildStarted signal", () => {
    const result = DevelopmentRuntimeRouteGuard.parseSignalFromPayload({
      kind: "buildStarted",
      buildVersion: "1.0.0",
    });
    expect(result).toEqual({ kind: "buildStarted", buildVersion: "1.0.0" });
  });

  it("parses buildStarted without buildVersion", () => {
    const result = DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildStarted" });
    expect(result).toEqual({ kind: "buildStarted", buildVersion: undefined });
  });

  it("parses buildCompleted signal with version", () => {
    const result = DevelopmentRuntimeRouteGuard.parseSignalFromPayload({
      kind: "buildCompleted",
      buildVersion: "2.0.0",
    });
    expect(result).toEqual({ kind: "buildCompleted", buildVersion: "2.0.0" });
  });

  it("parses buildCompleted without version", () => {
    const result = DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildCompleted" });
    expect(result).toEqual({ kind: "buildCompleted", buildVersion: undefined });
  });

  it("parses buildFailed signal with message", () => {
    const result = DevelopmentRuntimeRouteGuard.parseSignalFromPayload({
      kind: "buildFailed",
      message: "Compilation error",
    });
    expect(result).toEqual({ kind: "buildFailed", message: "Compilation error" });
  });

  it("throws for unsupported signal kind", () => {
    expect(() => DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "unknown" })).toThrow(
      "Unsupported development runtime signal.",
    );
  });

  it("throws for buildFailed with missing or empty message", () => {
    expect(() => DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildFailed" })).toThrow(
      "Unsupported development runtime signal.",
    );

    expect(() => DevelopmentRuntimeRouteGuard.parseSignalFromPayload({ kind: "buildFailed", message: "" })).toThrow(
      "Unsupported development runtime signal.",
    );
  });

  it("parses signal from JSON request body", async () => {
    const request = new Request("http://localhost/dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "buildStarted", buildVersion: "3.0.0" }),
    });
    const result = await DevelopmentRuntimeRouteGuard.parseSignal(request);
    expect(result).toEqual({ kind: "buildStarted", buildVersion: "3.0.0" });
  });
});
