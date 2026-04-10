import type { NodeConfigBase } from "../types";
import { isItemValue } from "../contracts/itemValue";
import type { AgentNodeConfig } from "./AiHost";

export class AgentConfigInspector {
  static isAgentNodeConfig(config: NodeConfigBase | undefined): config is AgentNodeConfig<any, any> {
    if (!config) return false;
    const candidate = config as Partial<AgentNodeConfig<any, any>>;
    return !!candidate.chatModel && this.hasCompatibleMessageConfiguration(candidate);
  }

  private static hasCompatibleMessageConfiguration(candidate: Partial<AgentNodeConfig<any, any>>): boolean {
    const messages = candidate.messages;
    if (messages === undefined || messages === null) {
      return false;
    }
    if (Array.isArray(messages)) {
      return messages.length > 0;
    }
    if (typeof messages === "object") {
      if (isItemValue(messages)) {
        return true;
      }
      const o = messages as { prompt?: unknown; buildMessages?: unknown };
      return (Array.isArray(o.prompt) && o.prompt.length > 0) || typeof o.buildMessages === "function";
    }
    return false;
  }
}
