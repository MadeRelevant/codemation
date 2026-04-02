import { ConsumerEnvDotenvFilePredicate } from "./ConsumerEnvDotenvFilePredicate";
import { DevSourceChangeClassifier } from "./DevSourceChangeClassifier";
import type { DevRebuildRequest } from "./DevRebuildQueue";

export type DevSourceRebuildPlan =
  | Readonly<{
      kind: "queue-rebuild";
      announcement: string;
      request: DevRebuildRequest;
    }>
  | Readonly<{
      kind: "restart-dev-process";
      message: string;
    }>;

export class DevSourceRebuildPlanner {
  private static readonly restartDevProcessMessage =
    "\n[codemation] Consumer environment file changed (e.g. .env). Restart the `codemation dev` process so the runtime picks up updated variables (host `process.env` does not hot-reload).\n";
  private static readonly runtimeOnlyAnnouncement =
    "\n[codemation] Source change detected — rebuilding consumer and restarting the runtime…\n";
  private static readonly runtimeAndUiAnnouncement =
    "\n[codemation] Source change detected — rebuilding consumer, restarting the runtime, and restarting the UI…\n";

  constructor(
    private readonly consumerEnvDotenvFilePredicate: ConsumerEnvDotenvFilePredicate,
    private readonly sourceChangeClassifier: DevSourceChangeClassifier,
  ) {}

  plan(
    args: Readonly<{
      changedPaths: ReadonlyArray<string>;
      consumerRoot: string;
    }>,
  ): DevSourceRebuildPlan {
    if (
      args.changedPaths.length > 0 &&
      args.changedPaths.every((changedPath) => this.consumerEnvDotenvFilePredicate.matches(changedPath))
    ) {
      return {
        kind: "restart-dev-process",
        message: DevSourceRebuildPlanner.restartDevProcessMessage,
      };
    }
    const shouldRepublishConsumerOutput = this.sourceChangeClassifier.shouldRepublishConsumerOutput(args);
    const shouldRestartUi = this.sourceChangeClassifier.requiresUiRestart(args);
    return {
      kind: "queue-rebuild",
      announcement: shouldRestartUi
        ? DevSourceRebuildPlanner.runtimeAndUiAnnouncement
        : DevSourceRebuildPlanner.runtimeOnlyAnnouncement,
      request: {
        changedPaths: [...args.changedPaths],
        shouldRepublishConsumerOutput,
        shouldRestartUi,
      },
    };
  }
}
