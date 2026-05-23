import type { NodeExecutionContext } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";

const DEFAULT_WF_ID = "wf_test";
const DEFAULT_RUN_ID = "run_test";
const DEFAULT_NODE_ID = "node_test";
const DEFAULT_ACT_ID = "act_test";

/**
 * Builds a minimal NodeExecutionContext for unit-testing core-node implementations.
 * All infrastructure (binary, run data) uses in-memory variants.
 *
 * Usage:
 *   const ctx = CoreNodesTestContextFactory.create(config);
 */
export class CoreNodesTestContextFactory {
  static create<TConfig extends { name: string }>(config: TConfig): NodeExecutionContext<TConfig> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      DEFAULT_WF_ID,
      DEFAULT_RUN_ID,
      () => new Date(),
    );
    return {
      runId: DEFAULT_RUN_ID,
      workflowId: DEFAULT_WF_ID,
      parent: undefined,
      now: () => new Date(),
      data: new InMemoryRunDataFactory().create(),
      nodeId: DEFAULT_NODE_ID,
      activationId: DEFAULT_ACT_ID,
      config,
      binary: binary.forNode({ nodeId: DEFAULT_NODE_ID, activationId: DEFAULT_ACT_ID }),
    };
  }
}
