import { InMemoryWorkflowRegistry } from "@codemation/core";

/** Host-owned mutable workflow catalog; same behavior as {@link InMemoryWorkflowRegistry}. */
export class LiveWorkflowCatalog extends InMemoryWorkflowRegistry {}
