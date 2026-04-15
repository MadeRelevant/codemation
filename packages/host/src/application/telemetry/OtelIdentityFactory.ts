import { createHash, randomBytes } from "node:crypto";
import { injectable } from "@codemation/core";

@injectable()
export class OtelIdentityFactory {
  createTraceId(runId: string): string {
    return this.hashToHex(runId, 32);
  }

  createRootSpanId(runId: string): string {
    return this.hashToHex(`run:${runId}`, 16);
  }

  createNodeSpanId(activationId: string): string {
    return this.hashToHex(`activation:${activationId}`, 16);
  }

  createConnectionInvocationSpanId(invocationId: string): string {
    return this.hashToHex(`invocation:${invocationId}`, 16);
  }

  createArtifactId(): string {
    return randomBytes(16).toString("hex");
  }

  createEphemeralSpanId(): string {
    return randomBytes(8).toString("hex");
  }

  private hashToHex(value: string, length: number): string {
    const hex = createHash("sha256").update(value).digest("hex").slice(0, length);
    return this.ensureNonZeroHex(hex, length);
  }

  private ensureNonZeroHex(hex: string, length: number): string {
    if (!/^0+$/.test(hex)) {
      return hex;
    }
    return `${"0".repeat(Math.max(0, length - 1))}1`;
  }
}
