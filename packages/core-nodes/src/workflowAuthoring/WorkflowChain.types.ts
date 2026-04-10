import type {
  DefinedNode,
  Item,
  Items,
  NodeExecutionContext,
  RunnableNodeConfig,
  RunnableNodeOutputJson,
  WorkflowDefinition,
} from "@codemation/core";
import { ChainCursor } from "@codemation/core";
import { z } from "zod";
import { Aggregate } from "../nodes/aggregate";
import { Filter } from "../nodes/filter";
import { If } from "../nodes/if";
import { MapData } from "../nodes/mapData";
import { Merge, type MergeMode } from "../nodes/merge";
import { Split } from "../nodes/split";
import { Switch } from "../nodes/switch";
import { Wait } from "../nodes/wait";
import type { WorkflowAgentOptions } from "./WorkflowAuthoringOptions.types";
import { WorkflowAgentNodeFactory } from "./WorkflowAgentNodeFactory.types";
import { WorkflowBranchBuilder } from "./WorkflowBranchBuilder.types";
import { WorkflowDefinedNodeResolver } from "./WorkflowDefinedNodeResolver.types";
import { WorkflowDurationParser } from "./WorkflowDurationParser.types";

type BranchCallback<TCurrentJson, TNextJson> = (
  branch: WorkflowBranchBuilder<TCurrentJson>,
) => WorkflowBranchBuilder<TNextJson>;
type RouteBranchCallback<TCurrentJson, TNextJson> = (branch: WorkflowChain<TCurrentJson>) => WorkflowChain<TNextJson>;
type BranchOutputMatch<TLeft, TRight> = [TLeft] extends [TRight] ? ([TRight] extends [TLeft] ? true : false) : false;

export class WorkflowChain<TCurrentJson> {
  constructor(private readonly chain: ChainCursor<TCurrentJson>) {}

  then<TOutputJson, TConfig extends RunnableNodeConfig<TCurrentJson, TOutputJson>>(
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

  split<TElem>(
    getElements: (item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[],
  ): WorkflowChain<TElem>;
  split<TElem>(
    name: string,
    getElements: (item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[],
    id?: string,
  ): WorkflowChain<TElem>;
  split<TElem>(
    nameOrGetter:
      | string
      | ((item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[]),
    getElementsOrUndefined?: (
      item: Item<TCurrentJson>,
      ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>,
    ) => readonly TElem[],
    id?: string,
  ): WorkflowChain<TElem> {
    const name = typeof nameOrGetter === "string" ? nameOrGetter : "Split";
    const getElements = typeof nameOrGetter === "string" ? getElementsOrUndefined! : nameOrGetter;
    return this.then(new Split<TCurrentJson, TElem>(name, getElements, id)) as WorkflowChain<TElem>;
  }

  filter(
    predicate: (
      item: Item<TCurrentJson>,
      index: number,
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Filter<TCurrentJson>>,
    ) => boolean,
  ): WorkflowChain<TCurrentJson>;
  filter(
    name: string,
    predicate: (
      item: Item<TCurrentJson>,
      index: number,
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Filter<TCurrentJson>>,
    ) => boolean,
    id?: string,
  ): WorkflowChain<TCurrentJson>;
  filter(
    nameOrPredicate:
      | string
      | ((
          item: Item<TCurrentJson>,
          index: number,
          items: Items<TCurrentJson>,
          ctx: NodeExecutionContext<Filter<TCurrentJson>>,
        ) => boolean),
    predicateOrUndefined?: (
      item: Item<TCurrentJson>,
      index: number,
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Filter<TCurrentJson>>,
    ) => boolean,
    id?: string,
  ): WorkflowChain<TCurrentJson> {
    const name = typeof nameOrPredicate === "string" ? nameOrPredicate : "Filter";
    const predicate = typeof nameOrPredicate === "string" ? predicateOrUndefined! : nameOrPredicate;
    return this.then(new Filter<TCurrentJson>(name, predicate, id)) as WorkflowChain<TCurrentJson>;
  }

  aggregate<TOut>(
    aggregateFn: (
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
    ) => TOut | Promise<TOut>,
  ): WorkflowChain<TOut>;
  aggregate<TOut>(
    name: string,
    aggregateFn: (
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
    ) => TOut | Promise<TOut>,
    id?: string,
  ): WorkflowChain<TOut>;
  aggregate<TOut>(
    nameOrFn:
      | string
      | ((
          items: Items<TCurrentJson>,
          ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
        ) => TOut | Promise<TOut>),
    aggregateFnOrUndefined?: (
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
    ) => TOut | Promise<TOut>,
    id?: string,
  ): WorkflowChain<TOut> {
    const name = typeof nameOrFn === "string" ? nameOrFn : "Aggregate";
    const aggregateFn = typeof nameOrFn === "string" ? aggregateFnOrUndefined! : nameOrFn;
    return this.then(new Aggregate<TCurrentJson, TOut>(name, aggregateFn, id)) as WorkflowChain<TOut>;
  }

  merge(): WorkflowChain<TCurrentJson>;
  merge(cfg: Readonly<{ mode: MergeMode; prefer?: ReadonlyArray<string> }>, id?: string): WorkflowChain<TCurrentJson>;
  merge(
    name: string,
    cfg?: Readonly<{ mode: MergeMode; prefer?: ReadonlyArray<string> }>,
    id?: string,
  ): WorkflowChain<TCurrentJson>;
  merge(
    nameOrCfg?: string | Readonly<{ mode: MergeMode; prefer?: ReadonlyArray<string> }>,
    cfgOrId?: Readonly<{ mode: MergeMode; prefer?: ReadonlyArray<string> }> | string,
    id?: string,
  ): WorkflowChain<TCurrentJson> {
    const name = typeof nameOrCfg === "string" ? nameOrCfg : "Merge";
    const cfg =
      typeof nameOrCfg === "string"
        ? ((typeof cfgOrId === "string" ? undefined : cfgOrId) ?? { mode: "passThrough" as const })
        : (nameOrCfg ?? { mode: "passThrough" as const });
    const mergeId = typeof cfgOrId === "string" ? cfgOrId : id;
    return new WorkflowChain(
      this.chain.thenIntoInputHints(new Merge<TCurrentJson>(name, cfg, mergeId)),
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

  route<TBranchJson>(
    branches: Readonly<Record<string, RouteBranchCallback<TCurrentJson, TBranchJson> | undefined>>,
  ): WorkflowChain<TBranchJson> {
    const mappedBranches = Object.fromEntries(
      Object.entries(branches).map(([port, branchFactory]) => [
        port,
        branchFactory
          ? (branch: ChainCursor<TCurrentJson>) => branchFactory(new WorkflowChain(branch)).chain
          : undefined,
      ]),
    ) as Readonly<
      Record<string, ((branch: ChainCursor<TCurrentJson>) => ChainCursor<TBranchJson> | undefined) | undefined>
    >;
    return new WorkflowChain(
      this.chain.route(
        mappedBranches as Readonly<
          Record<string, (branch: ChainCursor<TCurrentJson>) => ChainCursor<TBranchJson> | undefined>
        >,
      ),
    ) as WorkflowChain<TBranchJson>;
  }

  switch<TBranchJson>(
    cfg: Readonly<{
      cases: readonly string[];
      defaultCase: string;
      resolveCaseKey: (item: TCurrentJson) => string | Promise<string>;
      branches: Readonly<Record<string, RouteBranchCallback<TCurrentJson, TBranchJson> | undefined>>;
    }>,
  ): WorkflowChain<TBranchJson>;
  switch<TBranchJson>(
    name: string,
    cfg: Readonly<{
      cases: readonly string[];
      defaultCase: string;
      resolveCaseKey: (item: TCurrentJson) => string | Promise<string>;
      branches: Readonly<Record<string, RouteBranchCallback<TCurrentJson, TBranchJson> | undefined>>;
    }>,
    id?: string,
  ): WorkflowChain<TBranchJson>;
  switch<TBranchJson>(
    nameOrCfg:
      | string
      | Readonly<{
          cases: readonly string[];
          defaultCase: string;
          resolveCaseKey: (item: TCurrentJson) => string | Promise<string>;
          branches: Readonly<Record<string, RouteBranchCallback<TCurrentJson, TBranchJson> | undefined>>;
        }>,
    cfgOrUndefined?: Readonly<{
      cases: readonly string[];
      defaultCase: string;
      resolveCaseKey: (item: TCurrentJson) => string | Promise<string>;
      branches: Readonly<Record<string, RouteBranchCallback<TCurrentJson, TBranchJson> | undefined>>;
    }>,
    id?: string,
  ): WorkflowChain<TBranchJson> {
    const name = typeof nameOrCfg === "string" ? nameOrCfg : "Switch";
    const cfg = (typeof nameOrCfg === "string" ? cfgOrUndefined : nameOrCfg)!;
    const switched = this.then(
      new Switch<TCurrentJson>(
        name,
        {
          cases: cfg.cases,
          defaultCase: cfg.defaultCase,
          resolveCaseKey: (item) => cfg.resolveCaseKey(item.json as TCurrentJson),
        },
        id,
      ),
    ) as WorkflowChain<TCurrentJson>;
    return switched.route(cfg.branches);
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
