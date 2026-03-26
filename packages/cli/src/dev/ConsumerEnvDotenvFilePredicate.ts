import path from "node:path";

/**
 * True when `filePath` names a consumer dotenv file (`.env`, `.env.local`, …).
 * Used by `codemation dev` to distinguish env-only changes from source rebuilds.
 */
export class ConsumerEnvDotenvFilePredicate {
  matches(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName === ".env" || fileName.startsWith(".env.");
  }
}
