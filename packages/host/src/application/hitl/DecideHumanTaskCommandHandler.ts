import { inject, injectable } from "@codemation/core";
import type { HumanTaskActor, HumanTaskStore, JsonValue } from "@codemation/core";
import { HumanTaskStoreToken } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { HitlResumeTokenSigner } from "../../hitl/HitlResumeTokenSigner";
import { HitlTimeoutJobScheduler } from "../../hitl/HitlTimeoutJobScheduler";
import { DecisionSchemaValidator } from "./DecisionSchemaValidator";

export interface DecideHumanTaskArgs {
  taskId: string;
  decision: JsonValue;
  decidedBy: HumanTaskActor;
}

export interface DecideHumanTaskResult {
  status: "decided";
  runStatus: "running" | "halted";
}

@injectable()
export class DecideHumanTaskCommandHandler {
  private readonly taskStore: HumanTaskStore | undefined;

  constructor(
    @inject(HumanTaskStoreToken) taskStore: HumanTaskStore | undefined,
    @inject(Engine) private readonly engine: Engine,
    @inject(HitlResumeTokenSigner) private readonly tokenSigner: HitlResumeTokenSigner,
    @inject(HitlTimeoutJobScheduler) private readonly timeoutScheduler: HitlTimeoutJobScheduler,
    @inject(DecisionSchemaValidator) private readonly schemaValidator: DecisionSchemaValidator,
  ) {
    this.taskStore = taskStore;
  }

  async decide(args: DecideHumanTaskArgs): Promise<DecideHumanTaskResult> {
    if (!this.taskStore) {
      throw new ApplicationRequestError(503, "HITL is not available in this configuration");
    }
    const task = await this.taskStore.findById(args.taskId);
    if (!task) {
      throw new ApplicationRequestError(404, "HumanTask not found");
    }

    if (task.status !== "pending") {
      throw new ApplicationRequestError(409, `HumanTask is not pending (current status: ${task.status})`);
    }

    // Validate decision body against the stored schema
    const validationResult = this.schemaValidator.validate({
      schemaJson: task.decisionSchemaJson,
      value: args.decision,
    });
    if (!validationResult.valid) {
      throw new ApplicationRequestError(
        422,
        `Decision does not match the expected schema: ${validationResult.message}`,
      );
    }

    const decidedAt = new Date();
    await this.taskStore.markDecided({
      taskId: args.taskId,
      decision: args.decision,
      decidedBy: args.decidedBy,
      decidedAt,
    });

    // Cancel the timeout job to prevent double-resolution
    await this.timeoutScheduler.cancelTimeoutJob(args.taskId);

    // Resume the suspended run
    const resumeResult = await this.engine.resumeRun({
      runId: task.runId,
      taskId: task.id,
      resumeContext: {
        decision: {
          kind: "decided",
          value: args.decision,
          actor: args.decidedBy,
          decidedAt,
        },
        delivery: task.deliveryRef ?? null,
        task: {
          taskId: task.id,
          runId: task.runId,
          nodeId: task.nodeId,
          expiresAt: task.expiresAt,
          resumeUrl: "",
        },
      },
    });

    return {
      status: "decided",
      runStatus: resumeResult.status === "failed" || resumeResult.status === "halted" ? "halted" : "running",
    };
  }

  /** Used by the token-authenticated resume endpoint to validate the token and extract the actor. */
  async validateResumeToken(args: { taskId: string; token: string }): Promise<{ schemaHash: string }> {
    const result = this.tokenSigner.verify(args.token);
    if (!result.ok) {
      if (result.reason === "expired") {
        throw new ApplicationRequestError(410, "Resume token has expired");
      }
      throw new ApplicationRequestError(401, "Invalid resume token");
    }
    if (result.taskId !== args.taskId) {
      throw new ApplicationRequestError(401, "Token taskId does not match");
    }

    if (!this.taskStore) {
      throw new ApplicationRequestError(503, "HITL is not available in this configuration");
    }
    const task = await this.taskStore.findById(args.taskId);
    if (!task) {
      throw new ApplicationRequestError(404, "HumanTask not found");
    }

    // Schema hash drift detection (D6): token was signed with a hash of the schema at creation
    if (task.decisionSchemaHash.slice(0, 8) !== result.schemaHash) {
      throw new ApplicationRequestError(410, "Schema has changed since this token was issued");
    }

    return { schemaHash: result.schemaHash };
  }
}
