import path from "node:path";
import { CodemationPathExistence } from "./CodemationPathExistence";

export class CodemationWorkspaceRootDetector {
  constructor(private readonly pathExistence: CodemationPathExistence) {}

  async detect(startDirectory: string): Promise<string | null> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.pathExistence.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) return currentDirectory;
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) return null;
      currentDirectory = parentDirectory;
    }
  }
}
