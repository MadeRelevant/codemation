import { access } from "node:fs/promises";

export class CodemationFileExistenceChecker {
  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
