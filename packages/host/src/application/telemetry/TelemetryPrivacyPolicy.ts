import { injectable } from "@codemation/core";
import type { TelemetryArtifactAttachment } from "@codemation/core";

@injectable()
export class TelemetryPrivacyPolicy {
  private readonly captureArtifacts = false;
  private readonly maxPreviewLength = 1_000;

  shouldCaptureArtifact(_: TelemetryArtifactAttachment): boolean {
    return this.captureArtifacts;
  }

  trimPreviewText(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.length > this.maxPreviewLength ? value.slice(0, this.maxPreviewLength) : value;
  }
}
