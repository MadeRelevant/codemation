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

  it("returns generic 500 and does NOT include internal error message for unexpected errors", async () => {
    const internalError = new Error("PrismaClientKnownRequestError: unique constraint violation");
    const res = ServerHttpErrorResponseFactory.fromUnknown(internalError);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("Prisma");
    expect(body.error).not.toContain("unique constraint");
  });

  it("returns 500 for non-Error thrown value (string)", async () => {
    const res = ServerHttpErrorResponseFactory.fromUnknown("just a raw string error");
    expect(res.status).toBe(500);
  });

  it("returns 500 for Error with Error cause (covers formatCause Error branch)", async () => {
    const cause = new Error("root cause");
    const err = new Error("wrapper error", { cause });
    const res = ServerHttpErrorResponseFactory.fromUnknown(err);
    expect(res.status).toBe(500);
  });

  it("returns 500 for Error with non-Error cause (covers formatCause String branch)", async () => {
    const err = new Error("wrapper error");
    Object.defineProperty(err, "cause", { value: "string cause value", enumerable: true, configurable: true });
    const res = ServerHttpErrorResponseFactory.fromUnknown(err);
    expect(res.status).toBe(500);
  });
});
