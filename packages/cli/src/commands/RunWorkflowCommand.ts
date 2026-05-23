import type { Logger } from "@codemation/host/next/server";
import type { RunCommandResult } from "@codemation/host";
import { StartWorkflowRunCommand, GetRunStateQuery, ApplicationRequestError } from "@codemation/host";

import type { RunCliBootstrap, RunCliOptions } from "../run/RunCliBootstrap";

export type RunWorkflowCommandOptions = RunCliOptions &
  Readonly<{
    workflowId: string;
    input?: string;
    startAt?: string;
    timeout?: number;
  }>;

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export class RunWorkflowCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly bootstrap: RunCliBootstrap,
  ) {}

  async execute(options: RunWorkflowCommandOptions): Promise<void> {
    await this.bootstrap.withSession(options, async (session) => {
      let items: unknown[] | undefined;
      if (options.input !== undefined) {
        try {
          const parsed: unknown = JSON.parse(options.input);
          items = Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
        } catch {
          throw new Error(`--input must be valid JSON. Got: ${options.input}`);
        }
      }

      const result = (await session.getCommandBus().execute(
        new StartWorkflowRunCommand({
          workflowId: options.workflowId,
          items: items as never,
          startAt: options.startAt,
          synthesizeTriggerItems: items === undefined,
        }),
      )) as RunCommandResult;

      const { runId, workflowId } = result;
      this.cliLogger.info(`Run started: runId=${runId} workflow=${workflowId} status=${result.status}`);

      const timeoutMs = (options.timeout ?? 60) * 1000;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const state = await session.getQueryBus().execute(new GetRunStateQuery(runId));
        if (!state) {
          continue;
        }
        const status = state.status;
        if (TERMINAL_STATUSES.has(status)) {
          this.cliLogger.info(
            `Run finished: runId=${runId} workflow=${workflowId} status=${status} startedAt=${state.startedAt}`,
          );
          if (status !== "completed") {
            throw new ApplicationRequestError(1, `Run ended with status: ${status}`);
          }
          return;
        }
      }

      throw new ApplicationRequestError(1, `Run timed out after ${options.timeout ?? 60}s (runId=${runId})`);
    });
  }
}
