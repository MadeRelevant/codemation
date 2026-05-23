import type { Items } from "../../realtime/realtimeDomainTypes";
import type { JsonEditorState } from "../../lib/workflowDetail/workflowDetailTypes";

/**
 * Return interface for the pin-output sub-controller.
 *
 * Owns: pin-state overlay writes (toggle, edit, clear).
 * Selection side-effects (inspector node focus, URL navigation) are composed in the façade
 * by calling inspect.selectNodeAndOutputPort before calling the pin action.
 */
export type WorkflowPinControllerReturn = Readonly<{
  /**
   * Resolve the active output port for a node given current execution state.
   * Called by the façade to determine the port before invoking toggle/edit/clear.
   */
  resolveOutputPortForNode: (nodeId: string) => string | null;
  /**
   * Toggle pin state for the given node + port.
   * If pinned: clears the pin. If not pinned: pins the current live output.
   */
  togglePinnedOutput: (nodeId: string, outputPort: string) => void;
  /**
   * Build the editor state needed to open the pin-output JSON editor dialog.
   * Returns null when not in live-workflow context or when port/output is unavailable.
   */
  buildPinEditorState: (nodeId: string, outputPort: string) => JsonEditorState | null;
  /**
   * Commit a pin-output edit from the JSON editor dialog.
   * Called by the façade's saveJsonEditor when the editor is in pin-output mode.
   * Returns a promise that resolves when the overlay update is persisted.
   */
  commitPinEdit: (nodeId: string, outputPort: string, items: Items | undefined) => Promise<void>;
  /** Clear the pinned output for the given node + port. */
  clearPinnedOutput: (nodeId: string, outputPort: string) => void;
}>;
