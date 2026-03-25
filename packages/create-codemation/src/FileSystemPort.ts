/**
 * Narrow filesystem port for scaffolding (injectable for tests).
 */
export interface FileSystemPort {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  cp(source: string, destination: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}
