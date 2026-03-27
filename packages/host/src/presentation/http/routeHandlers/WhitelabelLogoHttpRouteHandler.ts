import { inject, injectable } from "@codemation/core";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { ApplicationTokens } from "../../../applicationTokens";
import type { CodemationWhitelabelConfig } from "../../config/CodemationWhitelabelConfig";

@injectable()
export class WhitelabelLogoHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.ProcessEnv)
    private readonly processEnv: Readonly<NodeJS.ProcessEnv>,
    @inject(ApplicationTokens.CodemationWhitelabelConfig)
    private readonly whitelabel: CodemationWhitelabelConfig,
  ) {}

  async getLogo(): Promise<Response> {
    const consumerRootRaw = this.processEnv.CODEMATION_CONSUMER_ROOT?.trim();
    if (!consumerRootRaw || consumerRootRaw.length === 0) {
      return new Response(null, { status: 404 });
    }
    const logoPath = this.whitelabel.logoPath?.trim();
    if (!logoPath || logoPath.length === 0) {
      return new Response(null, { status: 404 });
    }
    const consumerRoot = path.resolve(consumerRootRaw);
    let consumerRootReal: string;
    try {
      consumerRootReal = await this.safeRealpath(consumerRoot);
    } catch {
      return new Response(null, { status: 404 });
    }
    const candidate = path.resolve(consumerRoot, logoPath);
    let fileReal: string;
    try {
      fileReal = await this.safeRealpath(candidate);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (!this.isPathInsideDirectory(consumerRootReal, fileReal)) {
      return new Response(null, { status: 404 });
    }
    if (!existsSync(fileReal)) {
      return new Response(null, { status: 404 });
    }
    const contentType = this.resolveContentType(fileReal);
    const stream = createReadStream(fileReal);
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  }

  private async safeRealpath(p: string): Promise<string> {
    const { realpath } = await import("node:fs/promises");
    return await realpath(p);
  }

  private isPathInsideDirectory(directoryReal: string, fileReal: string): boolean {
    const relative = path.relative(directoryReal, fileReal);
    if (relative.length === 0) {
      return false;
    }
    if (relative.startsWith(`..${path.sep}`) || relative === "..") {
      return false;
    }
    return !path.isAbsolute(relative);
  }

  private resolveContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".svg":
        return "image/svg+xml";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".ico":
        return "image/x-icon";
      default:
        return "application/octet-stream";
    }
  }
}
