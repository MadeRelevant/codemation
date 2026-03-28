import type {
  NodeRef,
  OutputPortKey,
  RunnableNodeConfig,
  RunnableNodeOutputJson,
  WorkflowDefinition,
} from "../../types";

import { WorkflowBuilder } from "./WorkflowBuilder";
import { WhenBuilder } from "./WhenBuilder";
import type {
  AnyRunnableNodeConfig,
  BooleanWhenOverloads,
  BranchOutputGuard,
  BranchStepsArg,
  StepSequenceOutput,
} from "./workflowBuilderTypes";

type ChainCursorWhenOverloads<TCurrentJson> = BooleanWhenOverloads<TCurrentJson, WhenBuilder<TCurrentJson>> & {
  <
    TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
    TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
  >(
    branches: Readonly<{
      true?: TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> ? BranchStepsArg<TCurrentJson, TTrueSteps> : never;
      false?: TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig>
        ? BranchStepsArg<TCurrentJson, TFalseSteps>
        : never;
    }> &
      BranchOutputGuard<TCurrentJson, TTrueSteps, TFalseSteps>,
  ): ChainCursor<StepSequenceOutput<TCurrentJson, TTrueSteps>>;
};

export class ChainCursor<TCurrentJson> {
  constructor(
    private readonly wf: WorkflowBuilder,
    private readonly cursor: NodeRef,
    private readonly cursorOutput: OutputPortKey,
  ) {}

  then<TConfig extends RunnableNodeConfig<TCurrentJson, any>>(
    config: TConfig,
  ): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const next = (this.wf as any).add(config) as NodeRef;
    (this.wf as any).connect(this.cursor, next, this.cursorOutput);
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this.wf, next, "main");
  }

  readonly when: ChainCursorWhenOverloads<TCurrentJson> = ((
    arg1:
      | boolean
      | Readonly<{ true?: ReadonlyArray<AnyRunnableNodeConfig>; false?: ReadonlyArray<AnyRunnableNodeConfig> }>,
    steps?: ReadonlyArray<AnyRunnableNodeConfig> | AnyRunnableNodeConfig,
    ...more: AnyRunnableNodeConfig[]
  ): WhenBuilder<TCurrentJson> | ChainCursor<TCurrentJson> => {
    if (typeof arg1 === "boolean") {
      const list = Array.isArray(steps) ? steps : steps ? [steps, ...more] : more;
      const port: OutputPortKey = arg1 ? "true" : "false";
      const b = new WhenBuilder<TCurrentJson>(this.wf, this.cursor, port);
      b.addBranch(list);
      return b;
    }

    const branches = arg1;
    const makeMerge = (this.wf as any).options?.makeMergeNode as ((name: string) => AnyRunnableNodeConfig) | undefined;
    if (!makeMerge) {
      throw new Error(
        'WorkflowBuilder is missing options.makeMergeNode (required for when({true,false}). Use createWorkflowBuilder from "@codemation/core-nodes".',
      );
    }

    const wfAny = this.wf as any;

    const buildBranch = (
      port: OutputPortKey,
      branchSteps: ReadonlyArray<AnyRunnableNodeConfig> | undefined,
    ): Readonly<{ end: NodeRef; endOutput: OutputPortKey }> => {
      const list = branchSteps ?? [];
      let prev: NodeRef | null = null;
      for (const cfg of list) {
        const ref = wfAny.add(cfg) as NodeRef;
        if (!prev) wfAny.connect(this.cursor, ref, port, "in");
        else wfAny.connect(prev, ref, "main", "in");
        prev = ref;
      }
      if (!prev) return { end: this.cursor, endOutput: port };
      return { end: prev, endOutput: "main" };
    };

    const t = buildBranch("true", branches.true);
    const f = buildBranch("false", branches.false);

    const merge = wfAny.add(makeMerge("Merge (auto)")) as NodeRef;
    wfAny.connect(t.end, merge, t.endOutput, "true");
    wfAny.connect(f.end, merge, f.endOutput, "false");

    return new ChainCursor<TCurrentJson>(this.wf, merge, "main");
  }) as ChainCursorWhenOverloads<TCurrentJson>;

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}
