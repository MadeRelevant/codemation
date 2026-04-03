import { ChainCursor } from "@codemation/core";
import { ManualTrigger } from "../nodes/ManualTriggerFactory";
import { createWorkflowBuilder } from "../workflowBuilder.types";
import { WorkflowChain } from "./WorkflowChain.types";

export class WorkflowAuthoringBuilder {
  constructor(
    private readonly id: string,
    private readonly workflowName: string = id,
  ) {}

  name(name: string): WorkflowAuthoringBuilder {
    return new WorkflowAuthoringBuilder(this.id, name);
  }

  manualTrigger<TOutputJson>(defaultItems: TOutputJson | ReadonlyArray<TOutputJson>): WorkflowChain<TOutputJson>;
  manualTrigger<TOutputJson>(
    name: string,
    defaultItems?: TOutputJson | ReadonlyArray<TOutputJson>,
    id?: string,
  ): WorkflowChain<TOutputJson>;
  manualTrigger<TOutputJson>(
    nameOrDefaultItems: string | TOutputJson | ReadonlyArray<TOutputJson>,
    defaultItemsOrUndefined?: TOutputJson | ReadonlyArray<TOutputJson>,
    id?: string,
  ): WorkflowChain<TOutputJson> {
    const builder = createWorkflowBuilder({ id: this.id, name: this.workflowName });
    if (typeof nameOrDefaultItems === "string") {
      return new WorkflowChain(
        builder.trigger(
          new ManualTrigger<TOutputJson>(
            nameOrDefaultItems,
            defaultItemsOrUndefined as TOutputJson | ReadonlyArray<TOutputJson>,
            id,
          ),
        ) as ChainCursor<TOutputJson>,
      );
    }
    return new WorkflowChain(
      builder.trigger(new ManualTrigger<TOutputJson>("Manual trigger", nameOrDefaultItems)) as ChainCursor<TOutputJson>,
    );
  }
}
