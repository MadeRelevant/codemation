import type { DefinedNode, RunnableNodeConfig, RunnableNodeOutputJson, WorkflowDefinition } from "@codemation/core";
import { ChainCursor } from "@codemation/core";
import { z } from "zod";
import { If } from "../nodes/if";
import { MapData } from "../nodes/mapData";
import { Wait } from "../nodes/wait";
import type { WorkflowAgentOptions } from "./WorkflowAuthoringOptions.types";
import { WorkflowAgentNodeFactory } from "./WorkflowAgentNodeFactory.types";
import { WorkflowBranchBuilder } from "./WorkflowBranchBuilder.types";
import { WorkflowDefinedNodeResolver } from "./WorkflowDefinedNodeResolver.types";
import { WorkflowDurationParser } from "./WorkflowDurationParser.types";

type BranchCallback<TCurrentJson, TNextJson> = (
  branch: WorkflowBranchBuilder<TCurrentJson>,
) => WorkflowBranchBuilder<TNextJson>;
type BranchOutputMatch<TLeft, TRight> = [TLeft] extends [TRight] ? ([TRight] extends [TLeft] ? true : false) : false;

export class WorkflowChain<TCurrentJson> {
  constructor(private readonly chain: ChainCursor<TCurrentJson>) {}

  then<TInputJson, TOutputJson, TConfig extends RunnableNodeConfig<TInputJson, TOutputJson, TCurrentJson>>(
    config: TConfig,
  ): WorkflowChain<RunnableNodeOutputJson<TConfig>> {
    return new WorkflowChain(this.chain.then(config));
  }

  map<TNextJson>(mapper: (item: TCurrentJson) => TNextJson): WorkflowChain<TNextJson>;
  map<TNextJson>(name: string, mapper: (item: TCurrentJson) => TNextJson, id?: string): WorkflowChain<TNextJson>;
  map<TNextJson>(
    nameOrMapper: string | ((item: TCurrentJson) => TNextJson),
    mapperOrUndefined?: (item: TCurrentJson) => TNextJson,
    id?: string,
  ): WorkflowChain<TNextJson> {
    const name = typeof nameOrMapper === "string" ? nameOrMapper : "Map data";
    const mapper = typeof nameOrMapper === "string" ? mapperOrUndefined! : nameOrMapper;
    return this.then(
      new MapData<TCurrentJson, TNextJson>(name, (item) => mapper(item.json as TCurrentJson), id),
    ) as WorkflowChain<TNextJson>;
  }

  wait(duration: number | string): WorkflowChain<TCurrentJson>;
  wait(name: string, duration: number | string, id?: string): WorkflowChain<TCurrentJson>;
  wait(
    nameOrDuration: string | number,
    durationOrUndefined?: string | number,
    id?: string,
  ): WorkflowChain<TCurrentJson> {
    const name = typeof nameOrDuration === "string" && durationOrUndefined !== undefined ? nameOrDuration : "Wait";
    const duration = durationOrUndefined ?? nameOrDuration;
    return this.then(
      new Wait<TCurrentJson>(name, WorkflowDurationParser.parse(duration), id),
    ) as WorkflowChain<TCurrentJson>;
  }

  if<TBranchJson>(
    predicate: (item: TCurrentJson) => boolean,
    branches: Readonly<{
      true?: BranchCallback<TCurrentJson, TBranchJson>;
      false?: BranchCallback<TCurrentJson, TBranchJson>;
    }>,
  ): WorkflowChain<TBranchJson>;
  if<TBranchJson>(
    name: string,
    predicate: (item: TCurrentJson) => boolean,
    branches: Readonly<{
      true?: BranchCallback<TCurrentJson, TBranchJson>;
      false?: BranchCallback<TCurrentJson, TBranchJson>;
    }>,
  ): WorkflowChain<TBranchJson>;
  if<TTrueJson, TFalseJson>(
    nameOrPredicate: string | ((item: TCurrentJson) => boolean),
    predicateOrBranches:
      | ((item: TCurrentJson) => boolean)
      | Readonly<{ true?: BranchCallback<TCurrentJson, TTrueJson>; false?: BranchCallback<TCurrentJson, TFalseJson> }>,
    branchesOrUndefined?: Readonly<{
      true?: BranchCallback<TCurrentJson, TTrueJson>;
      false?: BranchCallback<TCurrentJson, TFalseJson>;
    }>,
  ): WorkflowChain<BranchOutputMatch<TTrueJson, TFalseJson> extends true ? TTrueJson : never> {
    const name = typeof nameOrPredicate === "string" ? nameOrPredicate : "If";
    const predicate =
      typeof nameOrPredicate === "string" ? (predicateOrBranches as (item: TCurrentJson) => boolean) : nameOrPredicate;
    const branches = (typeof nameOrPredicate === "string" ? branchesOrUndefined : predicateOrBranches) as Readonly<{
      true?: BranchCallback<TCurrentJson, TTrueJson>;
      false?: BranchCallback<TCurrentJson, TFalseJson>;
    }>;
    const cursor = this.chain.then(new If<TCurrentJson>(name, (item) => predicate(item.json as TCurrentJson)));
    const trueSteps = branches.true?.(new WorkflowBranchBuilder<TCurrentJson>()).getSteps();
    const falseSteps = branches.false?.(new WorkflowBranchBuilder<TCurrentJson>()).getSteps();
    return new WorkflowChain(
      cursor.when({
        true: trueSteps,
        false: falseSteps,
      }),
    ) as WorkflowChain<BranchOutputMatch<TTrueJson, TFalseJson> extends true ? TTrueJson : never>;
  }

  agent<TOutputSchema extends z.ZodTypeAny>(
    options: WorkflowAgentOptions<TCurrentJson, TOutputSchema>,
  ): WorkflowChain<z.output<TOutputSchema>>;
  agent(options: WorkflowAgentOptions<TCurrentJson, undefined>): WorkflowChain<Record<string, unknown>>;
  agent<TOutputSchema extends z.ZodTypeAny>(
    name: string,
    options: WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
  ): WorkflowChain<TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>>;
  agent<TOutputSchema extends z.ZodTypeAny>(
    nameOrOptions: string | WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
    optionsOrUndefined?: WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
  ): WorkflowChain<TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>> {
    return this.then(WorkflowAgentNodeFactory.create(nameOrOptions, optionsOrUndefined)) as WorkflowChain<
      TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>
    >;
  }

  node<TConfig extends Record<string, unknown>, TOutputJson>(
    definitionOrKey: DefinedNode<string, TConfig, TCurrentJson, TOutputJson> | string,
    config: TConfig,
    name?: string,
    id?: string,
  ): WorkflowChain<TOutputJson> {
    const definition = WorkflowDefinedNodeResolver.resolve(
      definitionOrKey as DefinedNode<string, Record<string, unknown>, unknown, unknown> | string,
    ) as DefinedNode<string, TConfig, TCurrentJson, TOutputJson>;
    return this.then(
      definition.create(config, name, id) as RunnableNodeConfig<TCurrentJson, TOutputJson>,
    ) as WorkflowChain<TOutputJson>;
  }

  build(): WorkflowDefinition {
    return this.chain.build();
  }
}
