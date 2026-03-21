import { describe,expect,it,vi } from "vitest";
import { ApplicationRequestError } from "../src/application/ApplicationRequestError";
import { ServerHttpErrorResponseFactory } from "../src/presentation/http/ServerHttpErrorResponseFactory";

describe("ServerHttpErrorResponseFactory", () => {
  it("returns application request errors without logging them as unexpected failures", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = ServerHttpErrorResponseFactory.fromUnknown(new ApplicationRequestError(400, "Invalid request"));

    await expect(response.json()).resolves.toEqual({ error: "Invalid request" });
    expect(response.status).toBe(400);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("logs unexpected errors with their stack traces", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("Boom");
    error.stack = "Error: Boom\n    at fake.ts:1:1";

    const response = ServerHttpErrorResponseFactory.fromUnknown(error);

    await expect(response.json()).resolves.toEqual({ error: "Boom" });
    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[codemation-http] unhandled route error\nError: Boom\n    at fake.ts:1:1");
  });
});
