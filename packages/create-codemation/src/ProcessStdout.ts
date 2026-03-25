import process from "node:process";

import type { TextOutputPort } from "./TextOutputPort";

export class ProcessStdout implements TextOutputPort {
  write(text: string): void {
    process.stdout.write(text);
  }
}
