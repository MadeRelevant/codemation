import type { JsonEditorState, PinBinaryMapsByItemIndex } from "../../lib/workflowDetail/workflowDetailTypes";

/**
 * Return interface for the modal JSON editor dialog sub-controller.
 *
 * Owns: dialog open/close state.
 * - `openEditor` is called by the façade (from pin controller) to open the dialog.
 * - `saveJsonEditor` is a prop provided by the façade, routing to the correct commit handler.
 */
export type WorkflowJsonEditControllerReturn = Readonly<{
  /** Current JSON editor dialog state, or null when closed. */
  jsonEditorState: JsonEditorState | null;
  /** Open the JSON editor dialog with the given initial state. */
  openEditor: (state: JsonEditorState) => void;
  /** Close the JSON editor dialog without saving. */
  closeJsonEditor: () => void;
  /** Save the JSON editor value and commit the appropriate change. */
  saveJsonEditor: (value: string, binaryMaps?: PinBinaryMapsByItemIndex) => void;
}>;
