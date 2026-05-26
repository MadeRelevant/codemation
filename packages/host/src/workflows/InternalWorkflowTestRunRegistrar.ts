import { inject, injectable } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { RunIntentService } from "@codemation/core/bootstrap";
import type { Hono } from "hono";
import { ApplicationTokens } from "../applicationTokens";
import type { WorkflowDefinitionRepository } from "../domain/workflows/WorkflowDefinitionRepository";
import { InternalHmacAuthMiddleware } from "../pairing/InternalHmacAuthMiddleware";
import type { InternalHonoApiRouteRegistrar } from "../presentation/http/hono/InternalHonoApiRouteRegistrar";

const TEST_RUN_TIMEOUT_MS = 30_000;

/**
 * Registers POST /internal/workflows/:workflowId/test-run — HMAC-verified endpoint
 * that runs a workflow once synchronously without requiring it to be active.
 * Used by the coding agent to verify a workflow before activating it.
 */
@injectable()
export class InternalWorkflowTestRunRegistrar implements InternalHonoApiRouteRegistrar {
  constructor(
    @inject(InternalHmacAuthMiddleware) private readonly hmacMiddleware: InternalHmacAuthMiddleware,
    @inject(RunIntentService) private readonly runIntentService: RunIntentService,
    @inject(Engine) private readonly engine: Engine,
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
  ) {}

  register(app: Hono): void {
    app.post("/internal/workflows/:workflowId/test-run", this.hmacMiddleware.handle(), async (c) => {
      const workflowId = c.req.param("workflowId");
      const startMs = Date.now();

      let input: unknown;
      try {
        const body = await c.req.json<{ input?: unknown }>();
        input = body.input;
      } catch {
        input = undefined;
      }

      const workflow = await this.workflowDefinitionRepository.getDefinition(workflowId);
      if (!workflow) {
        return c.json({ ok: false, error: `Unknown workflowId: ${workflowId}`, durationMs: Date.now() - startMs }, 404);
      }

      const items = input !== undefined ? [{ json: input as Record<string, unknown> }] : [{ json: {} }];

      let runResult;
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("test run timed out after 30s")), TEST_RUN_TIMEOUT_MS),
        );
        const runPromise = (async () => {
          const result = await this.runIntentService.startWorkflow({
            workflow,
            items,
            executionOptions: { localOnly: true },
          });
          if (result.status === "completed") {
            return result;
          }
          if (result.status === "failed") {
            return result;
          }
          // pending — wait for completion
          return await this.engine.waitForCompletion(result.runId);
        })();
        runResult = await Promise.race([runPromise, timeoutPromise]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ ok: false, error: message, durationMs: Date.now() - startMs });
      }

      if (runResult.status === "failed") {
        return c.json({
          ok: false,
          runId: runResult.runId,
          error: runResult.error.message,
          durationMs: Date.now() - startMs,
        });
      }

      if (runResult.status === "halted") {
        return c.json({
          ok: false,
          runId: runResult.runId,
          error: `Run halted: ${runResult.reason}`,
          durationMs: Date.now() - startMs,
        });
      }

      // completed
      return c.json({
        ok: true,
        runId: runResult.runId,
        output: runResult.outputs,
        durationMs: Date.now() - startMs,
      });
    });
  }
}
