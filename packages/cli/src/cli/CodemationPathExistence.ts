import { access } from "node:fs/promises";

export class CodemationPathExistence {
  async exists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
