import {
  ConsumerOutputSourceChangeClassifier,
  type ConsumerOutputRebuildClassification,
  type ConsumerOutputWatchEvent,
} from "./ConsumerOutputSourceChangeClassifier";

export class ConsumerOutputRebuildPlanner {
  constructor(
    private readonly sourceChangeClassifier: ConsumerOutputSourceChangeClassifier = new ConsumerOutputSourceChangeClassifier(),
  ) {}

  plan(
    args: Readonly<{
      configSourcePath: string | null;
      hasPreviousSnapshot: boolean;
      watchEvents: ReadonlyArray<ConsumerOutputWatchEvent>;
    }>,
  ): ConsumerOutputRebuildClassification {
    if (args.watchEvents.length === 0) {
      return { kind: "full" };
    }
    if (!args.hasPreviousSnapshot) {
      return { kind: "full" };
    }
    if (!args.configSourcePath) {
      return { kind: "full" };
    }
    return this.sourceChangeClassifier.classifyRebuild({
      configSourcePath: args.configSourcePath,
      events: args.watchEvents,
    });
  }
}
