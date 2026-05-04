/**
 * Thrown by {@link WorkflowBuilder.build} when the workflow definition is structurally invalid.
 *
 * Common causes:
 * - A node has an empty effective id (label is blank and no explicit `id` was given).
 * - Two or more nodes share the same effective id (label slugs collide or explicit ids clash).
 *
 * Fix: provide an explicit `id:` on the offending node configs.
 */
export class WorkflowDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowDefinitionError";
  }
}
