import readline from "node:readline/promises";

import type { InteractivePromptPort } from "./InteractivePromptPort";

export class NodeInteractivePrompt implements InteractivePromptPort {
  constructor(
    private readonly input: NodeJS.ReadableStream,
    private readonly output: NodeJS.WritableStream,
  ) {}

  async confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    try {
      const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
      return answer === "y" || answer === "yes";
    } finally {
      rl.close();
    }
  }

  async question(message: string): Promise<string> {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    try {
      return (await rl.question(message)).trim();
    } finally {
      rl.close();
    }
  }
}
