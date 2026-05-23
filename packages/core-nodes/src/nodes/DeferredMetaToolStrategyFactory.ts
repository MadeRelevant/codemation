import { injectable } from "@codemation/core";
import { BM25Index } from "./BM25Index";
import { DeferredMetaToolStrategy } from "./DeferredMetaToolStrategy";
import type { ToolLoadingStrategy, ToolLoadingStrategyInitInput } from "./ToolLoadingStrategy";

/**
 * Factory for creating and initializing a DeferredMetaToolStrategy per agent execution.
 * Injected into AIAgentNode; each agent call creates its own initialized strategy instance.
 * BM25Index is constructed here (this file is a composition root via the Factory suffix).
 */
@injectable()
export class DeferredMetaToolStrategyFactory {
  async create(input: ToolLoadingStrategyInitInput): Promise<ToolLoadingStrategy> {
    const strategy = new DeferredMetaToolStrategy(new BM25Index(), (msg) => console.warn(msg));
    await strategy.initialize(input);
    return strategy;
  }
}
