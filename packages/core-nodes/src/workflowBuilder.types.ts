import type { WorkflowId } from "@codemation/core";
import { WorkflowBuilder } from "@codemation/core";
import { Merge } from "./nodes/merge";

export function createWorkflowBuilder(meta: Readonly<{ id: WorkflowId; name: string }>): WorkflowBuilder {
  return new WorkflowBuilder(meta, {
    makeMergeNode: (name) => new Merge(name, { mode: "passThrough", prefer: ["true", "false"] }),
  });
}

