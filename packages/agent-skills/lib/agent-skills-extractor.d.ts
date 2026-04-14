import type { Dirent } from "node:fs";

export class CommandError extends Error {}

export class FileSystemGateway {
  copyDirectory(sourcePath: string, destinationPath: string): Promise<void>;
  createDirectory(targetPath: string): Promise<void>;
  listDirectoryEntries(targetPath: string): Promise<Dirent[]>;
  removePath(targetPath: string): Promise<void>;
  statPath(targetPath: string): Promise<import("node:fs").Stats>;
}

export function resolveAgentSkillsPackageRoot(): string;

export class SkillExtractor {
  constructor(
    fileSystem: FileSystemGateway,
    packageRoot: string,
    cwd: string,
    stdout: { write: (chunk: string) => void },
  );

  extract(outputArgument: string): Promise<void>;
}

export class CommandLineParser {
  constructor(argv: ReadonlyArray<string>);

  parse():
    | { command: "help" }
    | { command: "extract"; output: string };
}

export class CodemationAgentSkillsCli {
  constructor(
    argv: ReadonlyArray<string>,
    cwd: string,
    stdout: { write: (chunk: string) => void },
    stderr: { write: (chunk: string) => void },
  );

  run(): Promise<void>;
}
