/**
 * Coverage for CodemationAgentSkillsCli and CommandLineParser error and help paths.
 *
 * The existing AgentSkillsCli.test.ts covers the happy-path extract flow.
 * This file covers the remaining branches:
 * - --help / -h outputs help to stdout and does not set exit code 1
 * - Unknown command → CommandError → stderr + exit 1
 * - Unknown argument → CommandError → stderr + exit 1
 * - --output with no value → CommandError → stderr + exit 1
 * - Generic (non-CommandError) Error → stderr message + exit 1
 * - No command (empty argv) → help
 */
import { describe, expect, it, afterEach } from "vitest";
import { CommandLineParser, CodemationAgentSkillsCli, CommandError } from "../lib/agent-skills-extractor.mjs";

class OutputBuffer {
  private contents = "";
  write(value: string) {
    this.contents += value;
  }
  clear() {
    this.contents = "";
  }
  toString(): string {
    return this.contents;
  }
}

function makeCliWithArgs(argv: string[]): {
  cli: CodemationAgentSkillsCli;
  stdout: OutputBuffer;
  stderr: OutputBuffer;
} {
  const stdout = new OutputBuffer();
  const stderr = new OutputBuffer();
  const cli = new CodemationAgentSkillsCli(argv, process.cwd(), stdout, stderr);
  return { cli, stdout, stderr };
}

describe("CommandLineParser", () => {
  it("returns { command: 'help' } for --help flag", () => {
    const parser = new CommandLineParser(["--help"]);
    expect(parser.parse()).toEqual({ command: "help" });
  });

  it("returns { command: 'help' } for -h flag", () => {
    const parser = new CommandLineParser(["-h"]);
    expect(parser.parse()).toEqual({ command: "help" });
  });

  it("returns { command: 'help' } when argv is empty", () => {
    const parser = new CommandLineParser([]);
    expect(parser.parse()).toEqual({ command: "help" });
  });

  it("throws CommandError for unknown command", () => {
    const parser = new CommandLineParser(["unknown-cmd"]);
    expect(() => parser.parse()).toThrow(CommandError);
  });

  it("returns { command: 'extract', output: default } when no --output given", () => {
    const parser = new CommandLineParser(["extract"]);
    const result = parser.parse();
    expect(result).toEqual({ command: "extract", output: ".agents/skills/extracted" });
  });

  it("returns custom output path when --output is provided", () => {
    const parser = new CommandLineParser(["extract", "--output", "custom/path"]);
    expect(parser.parse()).toEqual({ command: "extract", output: "custom/path" });
  });

  it("throws CommandError when --output has no following value", () => {
    const parser = new CommandLineParser(["extract", "--output"]);
    expect(() => parser.parse()).toThrow(CommandError);
    expect(() => parser.parse()).toThrow(/Missing value for --output/);
  });

  it("throws CommandError for unknown argument within extract command", () => {
    const parser = new CommandLineParser(["extract", "--unknown"]);
    expect(() => parser.parse()).toThrow(CommandError);
  });

  it("returns help when --help appears within extract args", () => {
    const parser = new CommandLineParser(["extract", "--help"]);
    expect(parser.parse()).toEqual({ command: "help" });
  });

  it("returns help when -h appears within extract args", () => {
    const parser = new CommandLineParser(["extract", "-h"]);
    expect(parser.parse()).toEqual({ command: "help" });
  });
});

describe("CodemationAgentSkillsCli error and help paths", () => {
  let savedExitCode: number | undefined;

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it("--help writes help text to stdout and does not set exit code 1", async () => {
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    const { cli, stdout, stderr } = makeCliWithArgs(["--help"]);
    await cli.run();
    expect(stdout.toString()).toContain("codemation-agent-skills");
    expect(stdout.toString()).toContain("extract");
    expect(stderr.toString()).toBe("");
    expect(process.exitCode).toBe(0);
  });

  it("-h writes help text to stdout and does not set exit code 1", async () => {
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    const { cli, stdout, stderr } = makeCliWithArgs(["-h"]);
    await cli.run();
    expect(stdout.toString()).toContain("codemation-agent-skills");
    expect(stderr.toString()).toBe("");
    expect(process.exitCode).toBe(0);
  });

  it("unknown command writes error to stderr, appends help, sets exit code 1", async () => {
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    const { cli, stdout, stderr } = makeCliWithArgs(["unknown-command"]);
    await cli.run();
    expect(stderr.toString()).toContain("Unknown command");
    // Help is also written (to stdout) after a CommandError
    expect(stdout.toString()).toContain("codemation-agent-skills");
    expect(process.exitCode).toBe(1);
  });

  it("missing --output value writes error to stderr and sets exit code 1", async () => {
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    const { cli, stdout, stderr } = makeCliWithArgs(["extract", "--output"]);
    await cli.run();
    expect(stderr.toString()).toContain("Missing value for --output");
    expect(stdout.toString()).toContain("codemation-agent-skills");
    expect(process.exitCode).toBe(1);
  });

  it("generic Error (non-CommandError) writes message to stderr and sets exit code 1 without help", async () => {
    savedExitCode = process.exitCode;
    process.exitCode = 0;
    const stdout = new OutputBuffer();
    const stderr = new OutputBuffer();
    const cli = new CodemationAgentSkillsCli(
      ["extract", "--output", "/tmp/codemation-test-output-generic-err"],
      process.cwd(),
      stdout,
      stderr,
    );
    // Replace the fileSystem on the instance with one that throws a generic Error during extract
    (cli as any).fileSystem = {
      createDirectory: async () => {},
      listDirectoryEntries: async () => {
        throw new Error("synthetic generic failure for test coverage");
      },
      removePath: async () => {},
      copyDirectory: async () => {},
      statPath: async () => {},
    };
    await cli.run();
    // The error is not a CommandError so only the message goes to stderr (no help text)
    expect(stderr.toString()).toContain("synthetic generic failure for test coverage");
    expect(stdout.toString()).not.toContain("codemation-agent-skills");
    expect(process.exitCode).toBe(1);
  });
});
