// @vitest-environment node

/**
 * Unit tests for HitlResumeHonoApiRouteRegistrar.
 *
 * Registers the route on a real Hono app and drives it via app.request with a
 * stub DecideHumanTaskCommandHandler. Covers:
 *  - happy path: validateResumeToken + decide, returns the decide result as JSON
 *  - validateResumeToken throws ApplicationRequestError → mapped status
 *  - decide throws ApplicationRequestError → mapped status
 *  - empty token is passed through when the query param is absent
 *
 * No DI container / DB; the registrar's only dependency is the handler.
 */

import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HitlResumeHonoApiRouteRegistrar } from "../../src/presentation/http/hono/registrars/HitlResumeHonoApiRouteRegistrar";
import { ApplicationRequestError } from "../../src/application/ApplicationRequestError";

function makeApp(handler: { validateResumeToken: unknown; decide: unknown }): Hono {
  const app = new Hono();
  const registrar = new HitlResumeHonoApiRouteRegistrar(handler as never);
  registrar.register(app);
  return app;
}

async function postResume(app: Hono, taskId: string, query: string, body: unknown): Promise<Response> {
  return app.request(`/hitl/tasks/${taskId}/resume${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("HitlResumeHonoApiRouteRegistrar", () => {
  it("validates the token, decides, and returns the decide result", async () => {
    const validateResumeToken = vi.fn(async () => ({ schemaHash: "abc" }));
    const decide = vi.fn(async () => ({ status: "decided" as const, runStatus: "running" as const }));
    const app = makeApp({ validateResumeToken, decide });

    const res = await postResume(app, "task-1", "?token=signed", { decision: { approved: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "decided", runStatus: "running" });
    expect(validateResumeToken).toHaveBeenCalledWith({ taskId: "task-1", token: "signed" });
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "task-1", decidedBy: { actorId: "token-bearer" } }),
    );
  });

  it("defaults the token to empty string when the query param is absent", async () => {
    const validateResumeToken = vi.fn(async () => ({ schemaHash: "abc" }));
    const decide = vi.fn(async () => ({ status: "decided" as const, runStatus: "running" as const }));
    const app = makeApp({ validateResumeToken, decide });

    await postResume(app, "task-1", "", { decision: { approved: true } });

    expect(validateResumeToken).toHaveBeenCalledWith({ taskId: "task-1", token: "" });
  });

  it("maps an ApplicationRequestError from token validation to its status", async () => {
    const validateResumeToken = vi.fn(async () => {
      throw new ApplicationRequestError(410, "Resume token has expired");
    });
    const decide = vi.fn();
    const app = makeApp({ validateResumeToken, decide });

    const res = await postResume(app, "task-1", "?token=expired", { decision: { approved: true } });

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "Resume token has expired" });
    expect(decide).not.toHaveBeenCalled();
  });

  it("maps an ApplicationRequestError from decide to its status", async () => {
    const validateResumeToken = vi.fn(async () => ({ schemaHash: "abc" }));
    const decide = vi.fn(async () => {
      throw new ApplicationRequestError(409, "HumanTask is not pending (current status: decided)");
    });
    const app = makeApp({ validateResumeToken, decide });

    const res = await postResume(app, "task-1", "?token=signed", { decision: { approved: true } });

    expect(res.status).toBe(409);
  });
});
