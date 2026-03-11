import { readFile } from "node:fs/promises";

export interface CodemationPackageJson {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export class CodemationPackageJsonReader {
  async read(packageJsonPath: string): Promise<CodemationPackageJson> {
    const packageJsonContent = await readFile(packageJsonPath, "utf8");
    return JSON.parse(packageJsonContent) as CodemationPackageJson;
  }
}
