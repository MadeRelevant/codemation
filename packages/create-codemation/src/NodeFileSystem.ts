import fs from "node:fs/promises";

import type { FileSystemPort } from "./FileSystemPort";

export class NodeFileSystem implements FileSystemPort {
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(path, options);
  }

  async cp(source: string, destination: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await fs.cp(source, destination, options);
  }

  async readdir(path: string): Promise<string[]> {
    return fs.readdir(path);
  }

  async readFile(path: string, encoding: BufferEncoding): Promise<string> {
    return fs.readFile(path, { encoding });
  }

  async writeFile(path: string, data: string): Promise<void> {
    await fs.writeFile(path, data, "utf8");
  }

  async stat(path: string): Promise<{ isDirectory(): boolean }> {
    return fs.stat(path);
  }
}
