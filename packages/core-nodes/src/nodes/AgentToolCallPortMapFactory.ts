import type {
NodeInputsByPort
} from "@codemation/core";






export class AgentToolCallPortMap {
  static fromInput(input: unknown): NodeInputsByPort {
    return {
      in: [
        {
          json: input,
        },
      ],
    };
  }
}
