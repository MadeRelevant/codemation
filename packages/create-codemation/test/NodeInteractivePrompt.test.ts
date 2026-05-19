import { PassThrough } from "node:stream";

import { describe, expect, test } from "vitest";

import { NodeInteractivePrompt } from "../src/NodeInteractivePrompt";

class TestTtyInputStream extends PassThrough {
  readonly isTTY = true;

  readonly rawModeHistory: boolean[] = [];

  setRawMode(isRaw: boolean): void {
    this.rawModeHistory.push(isRaw);
  }
}

// ---------------------------------------------------------------------------
// confirm()
// ---------------------------------------------------------------------------

describe("confirm()", () => {
  function makePrompt(answer: string, options?: { defaultValue?: boolean }) {
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);
    const promise = prompt.confirm("Continue?", options);
    input.push(`${answer}\n`);
    input.push(null);
    return promise;
  }

  test("returns true for 'y'", async () => {
    await expect(makePrompt("y")).resolves.toBe(true);
  });

  test("returns true for 'yes'", async () => {
    await expect(makePrompt("yes")).resolves.toBe(true);
  });

  test("returns false for 'n'", async () => {
    await expect(makePrompt("n")).resolves.toBe(false);
  });

  test("returns false for empty answer when defaultValue is false", async () => {
    await expect(makePrompt("", { defaultValue: false })).resolves.toBe(false);
  });

  test("returns true for empty answer when defaultValue is true", async () => {
    await expect(makePrompt("", { defaultValue: true })).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// question() — visible (no mask)
// ---------------------------------------------------------------------------

describe("question() without maskInput", () => {
  test("returns the trimmed answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);
    const promise = prompt.question("Name: ");
    input.push("Alice\n");
    input.push(null);
    await expect(promise).resolves.toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// question() — masked (TTY path)
// ---------------------------------------------------------------------------

describe("question() with maskInput: true (TTY)", () => {
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

  test("DEL (\\u007f) removes the last character", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk: Buffer) => {
      written += chunk.toString("utf8");
    });
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    // "abc" + DEL removes "c" + Enter
    input.write("abc\r");

    await expect(answerPromise).resolves.toBe("ab");
    expect(written).toContain("\b \b");
  });

  test("\\b removes the last character", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    input.write("xy\b\r");

    await expect(answerPromise).resolves.toBe("x");
  });

  test("backspace on empty input is a no-op", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    // Backspace with nothing typed yet, then Enter
    input.write("\r");

    await expect(answerPromise).resolves.toBe("");
  });

  test("\\r\\n sequence does not double-finish", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    // Windows-style CRLF — the \\n after \\r should be swallowed
    input.write("secret\r\n");

    await expect(answerPromise).resolves.toBe("secret");
  });

  test("\\n (without prior \\r) finishes", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    input.write("pass\n");

    await expect(answerPromise).resolves.toBe("pass");
  });

  test("Ctrl+C (\\u0003) rejects with 'Prompt cancelled.'", async () => {
    const input = new TestTtyInputStream();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const answerPromise = prompt.question("Password: ", { maskInput: true });
    input.write("");

    await expect(answerPromise).rejects.toThrow("Prompt cancelled.");
  });
});

// ---------------------------------------------------------------------------
// question() — masked, non-TTY fallback
// ---------------------------------------------------------------------------

describe("question() with maskInput: true (non-TTY fallback)", () => {
  test("falls back to visible prompt when input is not a TTY", async () => {
    // Plain PassThrough has no isTTY → asTtyReadableStream returns null
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = new NodeInteractivePrompt(input, output);

    const promise = prompt.question("Secret: ", { maskInput: true });
    input.push("plaintext\n");
    input.push(null);

    await expect(promise).resolves.toBe("plaintext");
  });
});
