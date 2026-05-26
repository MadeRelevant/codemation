/**
 * Well-known symbol attached to the node definition produced by `defineHumanApprovalNode`
 * (story 04). The agent runtime uses this marker to detect HITL tools at binding time,
 * append the mandatory solo-call constraint sentence to the description, and enforce the
 * solo-call rule in the coordinator.
 *
 * **Both story 10 and story 04 must use this exact symbol.** Import this constant from
 * both sides; do not re-declare it.
 *
 * Symbol name: `"codemation.humanApprovalToolBehavior"`
 */
export const HUMAN_APPROVAL_MARKER: unique symbol = Symbol.for("codemation.humanApprovalToolBehavior");

/**
 * Shape of the metadata attached under `HUMAN_APPROVAL_MARKER` on node configs that were
 * created via `defineHumanApprovalNode`.
 */
export interface HumanApprovalToolBehavior {
  /** Whether to continue the agent loop on rejection (`"return"`) or halt the run (`"halt"`). */
  onRejected: "halt" | "return";
}
