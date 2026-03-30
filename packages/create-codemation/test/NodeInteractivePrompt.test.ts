import { PassThrough } from "node:stream";

import { expect, test } from "vitest";

import { NodeInteractivePrompt } from "../src/NodeInteractivePrompt";

class TestTtyInputStream extends PassThrough {
  readonly isTTY = true;

  readonly rawModeHistory: boolean[] = [];

  setRawMode(isRaw: boolean): void {
    this.rawModeHistory.push(isRaw);
  }
}

test("masks password answers in terminal prompts", async () => {
  const input = new TestTtyInputStream();
  const output = new PassThrough();
  let written = "";
  output.on("data", (chunk: Buffer) => {
    written += chunk.toString("utf8");
  });
  const prompt = new NodeInteractivePrompt(input, output);

  const answerPromise = prompt.question("Admin password: ", { maskInput: true });
  input.write("supersecret\r");

  await expect(answerPromise).resolves.toBe("supersecret");
  expect(written).toBe("Admin password: ***********\n");
  expect(input.rawModeHistory).toEqual([true, false]);
});
