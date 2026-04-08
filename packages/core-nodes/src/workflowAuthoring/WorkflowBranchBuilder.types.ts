import type { AnyRunnableNodeConfig, DefinedNode, RunnableNodeConfig, RunnableNodeOutputJson } from "@codemation/core";
import { z } from "zod";
import { MapData } from "../nodes/mapData";
import { Wait } from "../nodes/wait";
import type { WorkflowAgentOptions } from "./WorkflowAuthoringOptions.types";
import { WorkflowAgentNodeFactory } from "./WorkflowAgentNodeFactory.types";
import { WorkflowDefinedNodeResolver } from "./WorkflowDefinedNodeResolver.types";
import { WorkflowDurationParser } from "./WorkflowDurationParser.types";

export class WorkflowBranchBuilder<TCurrentJson> {
  constructor(private readonly steps: ReadonlyArray<AnyRunnableNodeConfig> = []) {}

  then<TInputJson, TOutputJson, TConfig extends RunnableNodeConfig<TInputJson, TOutputJson, TCurrentJson>>(
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
