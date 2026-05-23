import { describe, it, expect } from "vitest";
import { ServerHttpErrorResponseFactory } from "../../src/presentation/http/ServerHttpErrorResponseFactory";
import { ApplicationRequestError } from "../../src/application/ApplicationRequestError";

describe("ServerHttpErrorResponseFactory", () => {
  it("returns ApplicationRequestError payload with correct status", async () => {
    const err = new ApplicationRequestError(400, "Bad request", ["field is required"]);
    const res = ServerHttpErrorResponseFactory.fromUnknown(err);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; errors: string[] };
    expect(body.error).toBe("Bad request");
    expect(body.errors).toEqual(["field is required"]);
  });

  it("returns 500 with full message + stack so the canvas can render a copy/paste dialog", async () => {
    // Regression test: this used to return only `{ error: "Internal server error" }`, which
    // forced the operator to dig through the CLI log to triage a run-workflow failure. The
    // canvas now reads `message` + `stack` from the body and surfaces them in a modal.
    const internalError = new Error("Metadata scope doesn't allow format FULL");
    const res = ServerHttpErrorResponseFactory.fromUnknown(internalError);
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: string;
      message: string;
      name?: string;
      stack?: string;
      cause?: string;
    };
    expect(body.error).toBe("Internal server error");
    expect(body.message).toBe("Metadata scope doesn't allow format FULL");
    expect(body.name).toBe("Error");
    expect(body.stack).toContain("Metadata scope doesn't allow format FULL");
    expect(body.cause).toBeUndefined();
  });

  it("returns 500 for non-Error thrown value (string)", async () => {
    const res = ServerHttpErrorResponseFactory.fromUnknown("just a raw string error");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).toBe("just a raw string error");
  });

  it("returns 500 with Error-cause text when cause is an Error", async () => {
    const cause = new Error("root cause");
    const err = new Error("wrapper error", { cause });
    const res = ServerHttpErrorResponseFactory.fromUnknown(err);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string; cause?: string };
    expect(body.message).toBe("wrapper error");
    expect(body.cause).toContain("root cause");
  });

  it("returns 500 with String-cause text when cause is a string", async () => {
    const err = new Error("wrapper error");
    Object.defineProperty(err, "cause", { value: "string cause value", enumerable: true, configurable: true });
    const res = ServerHttpErrorResponseFactory.fromUnknown(err);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { cause?: string };
    expect(body.cause).toBe("string cause value");
  });
});
