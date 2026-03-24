import type { Container } from "@codemation/core";
import { AIAgentNode } from "./nodes/aiAgent";
import { CallbackNode } from "./nodes/CallbackNodeFactory";
import { HttpRequestNode } from "./nodes/httpRequest";
import { IfNode } from "./nodes/if";
import { ManualTriggerNode } from "./nodes/ManualTriggerFactory";
import { MapDataNode } from "./nodes/mapData";
import { NoOpNode } from "./nodes/noOp";
import { SubWorkflowNode } from "./nodes/subWorkflow";
import { WaitNode } from "./nodes/wait";
import { ConnectionCredentialNode } from "./nodes/ConnectionCredentialNode";

/**
 * Registrar for built-in nodes. In a real project, this would use tsyringe's
 * container.registerSingleton(...). For the skeleton we keep it token-based:
 * the engine resolves node implementations by class token.
 */
export function registerCoreNodes(container: Container): void {
  // With class tokens, resolving registers happen via the DI container setup.
  // This function exists as the standardized extension point.
  void container;

  // Example: if using tsyringe, you'd do:
  // tsyringeContainer.registerSingleton(IfNode, IfNode);
  // ...
  void IfNode;
  void HttpRequestNode;
  void CallbackNode;
  void MapDataNode;
  void NoOpNode;
  void SubWorkflowNode;
  void ManualTriggerNode;
  void AIAgentNode;
  void WaitNode;
  void ConnectionCredentialNode;
}

