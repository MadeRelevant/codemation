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

type ChainCursorEndpoint = Readonly<{ node: NodeRef; output: OutputPortKey }>;

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
    private readonly endpoints: ReadonlyArray<ChainCursorEndpoint>,
  ) {}

  then<TOutputJson, TConfig extends RunnableNodeConfig<TCurrentJson, TOutputJson>>(
    config: TConfig,
  ): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const next = (this.wf as any).add(config) as NodeRef;
    for (const e of this.endpoints) {
      (this.wf as any).connect(e.node, next, e.output);
    }
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this.wf, [{ node: next, output: "main" }]);
  }

  readonly when: ChainCursorWhenOverloads<TCurrentJson> = ((
    arg1:
      | boolean
      | Readonly<{ true?: ReadonlyArray<AnyRunnableNodeConfig>; false?: ReadonlyArray<AnyRunnableNodeConfig> }>,
    steps?: ReadonlyArray<AnyRunnableNodeConfig> | AnyRunnableNodeConfig,
    ...more: AnyRunnableNodeConfig[]
  ): WhenBuilder<TCurrentJson> | ChainCursor<TCurrentJson> => {
    if (this.endpoints.length !== 1) {
      throw new Error("ChainCursor.when(...) is only supported from a single cursor endpoint");
    }
    const cursor = this.endpoints[0]!.node;

    if (typeof arg1 === "boolean") {
      const list = Array.isArray(steps) ? steps : steps ? [steps, ...more] : more;
      const port: OutputPortKey = arg1 ? "true" : "false";
      const b = new WhenBuilder<TCurrentJson>(this.wf, cursor, port);
      b.addBranch(list);
      return b;
    }

    const branches = arg1;
    const wfAny = this.wf as any;

    const buildBranch = (
      port: OutputPortKey,
      branchSteps: ReadonlyArray<AnyRunnableNodeConfig> | undefined,
    ): Readonly<{ end: NodeRef; endOutput: OutputPortKey }> => {
      const list = branchSteps ?? [];
      let prev: NodeRef | null = null;
      for (const cfg of list) {
        const ref = wfAny.add(cfg) as NodeRef;
        if (!prev) wfAny.connect(cursor, ref, port, "in");
        else wfAny.connect(prev, ref, "main", "in");
        prev = ref;
      }
      if (!prev) return { end: cursor, endOutput: port };
      return { end: prev, endOutput: "main" };
    };

    const t = buildBranch("true", branches.true);
    const f = buildBranch("false", branches.false);
    return new ChainCursor<TCurrentJson>(this.wf, [
      { node: t.end, output: t.endOutput },
      { node: f.end, output: f.endOutput },
    ]);
  }) as ChainCursorWhenOverloads<TCurrentJson>;

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}
