import type {
  AnyRunnableNodeConfig,
  DefinedNode,
  Item,
  Items,
  NodeExecutionContext,
  RunnableNodeConfig,
  RunnableNodeOutputJson,
} from "@codemation/core";
import { z } from "zod";
import { Aggregate } from "../nodes/aggregate";
import { Filter } from "../nodes/filter";
import { MapData } from "../nodes/mapData";
import { Split } from "../nodes/split";
import { Wait } from "../nodes/wait";
import type { WorkflowAgentOptions } from "./WorkflowAuthoringOptions.types";
import { WorkflowAgentNodeFactory } from "./WorkflowAgentNodeFactory.types";
import { WorkflowDefinedNodeResolver } from "./WorkflowDefinedNodeResolver.types";
import { WorkflowDurationParser } from "./WorkflowDurationParser.types";

export class WorkflowBranchBuilder<TCurrentJson> {
  constructor(private readonly steps: ReadonlyArray<AnyRunnableNodeConfig> = []) {}

  then<TOutputJson, TConfig extends RunnableNodeConfig<TCurrentJson, TOutputJson>>(
    config: TConfig,
  ): WorkflowBranchBuilder<RunnableNodeOutputJson<TConfig>> {
    return new WorkflowBranchBuilder<RunnableNodeOutputJson<TConfig>>([...this.steps, config]);
  }

  map<TNextJson>(mapper: (item: TCurrentJson) => TNextJson): WorkflowBranchBuilder<TNextJson>;
  map<TNextJson>(
    name: string,
    mapper: (item: TCurrentJson) => TNextJson,
    id?: string,
  ): WorkflowBranchBuilder<TNextJson>;
  map<TNextJson>(
    nameOrMapper: string | ((item: TCurrentJson) => TNextJson),
    mapperOrUndefined?: (item: TCurrentJson) => TNextJson,
    id?: string,
  ): WorkflowBranchBuilder<TNextJson> {
    const name = typeof nameOrMapper === "string" ? nameOrMapper : "Map data";
    const mapper = typeof nameOrMapper === "string" ? mapperOrUndefined! : nameOrMapper;
    return this.then(
      new MapData<TCurrentJson, TNextJson>(name, (item) => mapper(item.json as TCurrentJson), id),
    ) as WorkflowBranchBuilder<TNextJson>;
  }

  wait(duration: number | string): WorkflowBranchBuilder<TCurrentJson>;
  wait(name: string, duration: number | string, id?: string): WorkflowBranchBuilder<TCurrentJson>;
  wait(
    nameOrDuration: string | number,
    durationOrUndefined?: string | number,
    id?: string,
  ): WorkflowBranchBuilder<TCurrentJson> {
    const name = typeof nameOrDuration === "string" && durationOrUndefined !== undefined ? nameOrDuration : "Wait";
    const duration = durationOrUndefined ?? nameOrDuration;
    return this.then(
      new Wait<TCurrentJson>(name, WorkflowDurationParser.parse(duration), id),
    ) as WorkflowBranchBuilder<TCurrentJson>;
  }

  split<TElem>(
    getElements: (item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[],
  ): WorkflowBranchBuilder<TElem>;
  split<TElem>(
    name: string,
    getElements: (item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[],
    id?: string,
  ): WorkflowBranchBuilder<TElem>;
  split<TElem>(
    nameOrGetter:
      | string
      | ((item: Item<TCurrentJson>, ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>) => readonly TElem[]),
    getElementsOrUndefined?: (
      item: Item<TCurrentJson>,
      ctx: NodeExecutionContext<Split<TCurrentJson, TElem>>,
    ) => readonly TElem[],
    id?: string,
  ): WorkflowBranchBuilder<TElem> {
    const name = typeof nameOrGetter === "string" ? nameOrGetter : "Split";
    const getElements = typeof nameOrGetter === "string" ? getElementsOrUndefined! : nameOrGetter;
    return this.then(new Split<TCurrentJson, TElem>(name, getElements, id)) as WorkflowBranchBuilder<TElem>;
  }

  filter(
    predicate: (
      item: Item<TCurrentJson>,
      index: number,
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Filter<TCurrentJson>>,
    ) => boolean,
  ): WorkflowBranchBuilder<TCurrentJson>;
  filter(
    name: string,
    predicate: (
      item: Item<TCurrentJson>,
      index: number,
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Filter<TCurrentJson>>,
    ) => boolean,
    id?: string,
  ): WorkflowBranchBuilder<TCurrentJson>;
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
  ): WorkflowBranchBuilder<TCurrentJson> {
    const name = typeof nameOrPredicate === "string" ? nameOrPredicate : "Filter";
    const predicate = typeof nameOrPredicate === "string" ? predicateOrUndefined! : nameOrPredicate;
    return this.then(new Filter<TCurrentJson>(name, predicate, id)) as WorkflowBranchBuilder<TCurrentJson>;
  }

  aggregate<TOut>(
    aggregateFn: (
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
    ) => TOut | Promise<TOut>,
  ): WorkflowBranchBuilder<TOut>;
  aggregate<TOut>(
    name: string,
    aggregateFn: (
      items: Items<TCurrentJson>,
      ctx: NodeExecutionContext<Aggregate<TCurrentJson, TOut>>,
    ) => TOut | Promise<TOut>,
    id?: string,
  ): WorkflowBranchBuilder<TOut>;
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
  ): WorkflowBranchBuilder<TOut> {
    const name = typeof nameOrFn === "string" ? nameOrFn : "Aggregate";
    const aggregateFn = typeof nameOrFn === "string" ? aggregateFnOrUndefined! : nameOrFn;
    return this.then(new Aggregate<TCurrentJson, TOut>(name, aggregateFn, id)) as WorkflowBranchBuilder<TOut>;
  }

  agent<TOutputSchema extends z.ZodTypeAny>(
    options: WorkflowAgentOptions<TCurrentJson, TOutputSchema>,
  ): WorkflowBranchBuilder<z.output<TOutputSchema>>;
  agent(options: WorkflowAgentOptions<TCurrentJson, undefined>): WorkflowBranchBuilder<Record<string, unknown>>;
  agent<TOutputSchema extends z.ZodTypeAny>(
    name: string,
    options: WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
  ): WorkflowBranchBuilder<TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>>;
  agent<TOutputSchema extends z.ZodTypeAny>(
    nameOrOptions: string | WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
    optionsOrUndefined?: WorkflowAgentOptions<TCurrentJson, TOutputSchema | undefined>,
  ): WorkflowBranchBuilder<TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>> {
    return this.then(WorkflowAgentNodeFactory.create(nameOrOptions, optionsOrUndefined)) as WorkflowBranchBuilder<
      TOutputSchema extends z.ZodTypeAny ? z.output<TOutputSchema> : Record<string, unknown>
    >;
  }

  node<TConfig extends Record<string, unknown>, TOutputJson>(
    definitionOrKey: DefinedNode<string, TConfig, TCurrentJson, TOutputJson> | string,
    config: TConfig,
    name?: string,
    id?: string,
  ): WorkflowBranchBuilder<TOutputJson> {
    const definition = WorkflowDefinedNodeResolver.resolve(
      definitionOrKey as DefinedNode<string, Record<string, unknown>, unknown, unknown> | string,
    ) as DefinedNode<string, TConfig, TCurrentJson, TOutputJson>;
    return this.then(
      definition.create(config, name, id) as RunnableNodeConfig<TCurrentJson, TOutputJson>,
    ) as WorkflowBranchBuilder<TOutputJson>;
  }

  getSteps(): ReadonlyArray<AnyRunnableNodeConfig> {
    return this.steps;
  }
}
