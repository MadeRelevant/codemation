import type { RunnableNodeConfig,RunnableNodeOutputJson,TriggerNodeConfig } from "./types";

export type AnyRunnableNodeConfig = RunnableNodeConfig<any, any>;

export type AnyTriggerNodeConfig = TriggerNodeConfig<any>;

export type ValidStepSequence<TCurrentJson, TSteps extends ReadonlyArray<AnyRunnableNodeConfig>> =
  TSteps extends readonly []
    ? readonly []
    : TSteps extends readonly [infer TFirst, ...infer TRest]
      ? TFirst extends RunnableNodeConfig<TCurrentJson, infer TNextJson>
        ? TRest extends ReadonlyArray<AnyRunnableNodeConfig>
          ? readonly [TFirst, ...ValidStepSequence<TNextJson, TRest>]
          : never
        : never
      : TSteps;

export type StepSequenceOutput<TCurrentJson, TSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined> =
  TSteps extends ReadonlyArray<AnyRunnableNodeConfig>
    ? TSteps extends readonly []
      ? TCurrentJson
      : TSteps extends readonly [infer TFirst, ...infer TRest]
        ? TFirst extends RunnableNodeConfig<TCurrentJson, infer TNextJson>
          ? TRest extends ReadonlyArray<AnyRunnableNodeConfig>
            ? StepSequenceOutput<TNextJson, TRest>
            : never
          : never
        : TCurrentJson
    : TCurrentJson;

type TypesMatch<TLeft, TRight> = [TLeft] extends [TRight] ? ([TRight] extends [TLeft] ? true : false) : false;

export type BranchOutputGuard<
  TCurrentJson,
  TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
  TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
> =
  TypesMatch<StepSequenceOutput<TCurrentJson, TTrueSteps>, StepSequenceOutput<TCurrentJson, TFalseSteps>> extends true
    ? unknown
    : never;

export type BranchStepsArg<TCurrentJson, TSteps extends ReadonlyArray<AnyRunnableNodeConfig>> = TSteps &
  ValidStepSequence<TCurrentJson, TSteps>;

export type BranchMoreArgs<
  TCurrentJson,
  TFirstStep extends RunnableNodeConfig<TCurrentJson, any>,
  TRestSteps extends ReadonlyArray<AnyRunnableNodeConfig>,
> = TRestSteps & ValidStepSequence<RunnableNodeOutputJson<TFirstStep>, TRestSteps>;

export type BooleanWhenOverloads<TCurrentJson, TReturn> = {
  <TSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(branch: boolean, steps: BranchStepsArg<TCurrentJson, TSteps>): TReturn;
  <TFirstStep extends RunnableNodeConfig<TCurrentJson, any>, TRestSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(
    branch: boolean,
    step: TFirstStep,
    ...more: BranchMoreArgs<TCurrentJson, TFirstStep, TRestSteps>
  ): TReturn;
};
