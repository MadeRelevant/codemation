import readline from "node:readline/promises";

import type { InteractivePromptPort } from "./InteractivePromptPort";

type TtyReadableStream = NodeJS.ReadableStream & {
  isTTY?: boolean;
  pause?: () => void;
  resume?: () => void;
  setEncoding?: (encoding: BufferEncoding) => void;
  setRawMode?: (isRaw: boolean) => void;
};

export class NodeInteractivePrompt implements InteractivePromptPort {
  constructor(
    private readonly input: NodeJS.ReadableStream,
    private readonly output: NodeJS.WritableStream,
  ) {}

  async confirm(message: string, options?: Readonly<{ defaultValue?: boolean }>): Promise<boolean> {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    try {
      const suffix = options?.defaultValue === true ? " [Y/n] " : " [y/N] ";
      const answer = (await rl.question(`${message}${suffix}`)).trim().toLowerCase();
      if (answer.length === 0) {
        return options?.defaultValue === true;
      }
      return answer === "y" || answer === "yes";
    } finally {
      rl.close();
    }
  }

  async question(message: string, options?: Readonly<{ maskInput?: boolean }>): Promise<string> {
    if (options?.maskInput) {
      return await this.askMaskedQuestion(message);
    }
    return await this.askVisibleQuestion(message);
  }

  private async askVisibleQuestion(message: string): Promise<string> {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    try {
      return (await rl.question(message)).trim();
    } finally {
      rl.close();
    }
  }

  private async askMaskedQuestion(message: string): Promise<string> {
    const ttyInput = this.asTtyReadableStream(this.input);
    if (!ttyInput) {
      return await this.askVisibleQuestion(message);
    }
    this.output.write(message);
    ttyInput.setEncoding?.("utf8");
    ttyInput.resume?.();
    ttyInput.setRawMode?.(true);
    return await new Promise<string>((resolve, reject) => {
      let value = "";
      let sawCarriageReturn = false;
      const cleanup = (): void => {
        ttyInput.removeListener("data", onData);
        ttyInput.setRawMode?.(false);
        ttyInput.pause?.();
      };
      const finish = (): void => {
        this.output.write("\n");
        cleanup();
        resolve(value.trim());
      };
      const cancel = (): void => {
        this.output.write("\n");
        cleanup();
        reject(new Error("Prompt cancelled."));
      };
      const onData = (chunk: string | Buffer): void => {
        const text = chunk.toString();
        for (const character of text) {
          if (character === "\u0003") {
            cancel();
            return;
          }
          if (character === "\r") {
            sawCarriageReturn = true;
            finish();
            return;
          }
          if (character === "\n") {
            if (sawCarriageReturn) {
              sawCarriageReturn = false;
              continue;
            }
            finish();
            return;
          }
          sawCarriageReturn = false;
          if (character === "\u007f" || character === "\b") {
            if (value.length > 0) {
              value = value.slice(0, -1);
              this.output.write("\b \b");
            }
            continue;
          }
          value += character;
          this.output.write("*");
        }
      };
      ttyInput.on("data", onData);
    });
  }

  private asTtyReadableStream(stream: NodeJS.ReadableStream): TtyReadableStream | null {
    const ttyStream = stream as TtyReadableStream;
    if (ttyStream.isTTY !== true || typeof ttyStream.setRawMode !== "function") {
      return null;
    }
    return ttyStream;
  }
}
