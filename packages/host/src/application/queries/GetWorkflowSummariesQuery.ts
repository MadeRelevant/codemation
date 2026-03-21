import type { WorkflowDefinition } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetWorkflowSummariesQuery extends Query<ReadonlyArray<WorkflowDefinition>> {}
