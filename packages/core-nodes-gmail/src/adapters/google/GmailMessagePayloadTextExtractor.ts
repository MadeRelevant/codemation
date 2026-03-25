/**
 * Extracts inline text/plain and text/html from a Gmail `users.messages` payload
 * (format `full`). Skips attachment parts that only expose `attachmentId` (fetched separately).
 */
export class GmailMessagePayloadTextExtractor {
  extract(payload: unknown): Readonly<{ textPlain?: string; textHtml?: string }> {
    const plainParts: string[] = [];
    const htmlParts: string[] = [];
    this.walkPart(payload, plainParts, htmlParts);
    return {
      textPlain: plainParts.length > 0 ? plainParts.join("\n\n") : undefined,
      textHtml: htmlParts.length > 0 ? htmlParts.join("\n\n") : undefined,
    };
  }

  private walkPart(part: unknown, plainParts: string[], htmlParts: string[]): void {
    if (!part || typeof part !== "object") {
      return;
    }
    const candidate = part as Readonly<{
      mimeType?: string | null;
      body?: Readonly<{
        data?: string | null;
        attachmentId?: string | null;
      }> | null;
      parts?: ReadonlyArray<unknown> | null;
    }>;
    const mimeType = (candidate.mimeType ?? "").toLowerCase();
    const body = candidate.body;
    const inlineData = body?.data;
    const attachmentId = body?.attachmentId;

    if (inlineData && typeof inlineData === "string" && inlineData.length > 0 && !attachmentId) {
      if (mimeType === "text/plain" || mimeType.startsWith("text/plain;")) {
        plainParts.push(this.decodeBase64UrlToUtf8(inlineData));
      } else if (mimeType === "text/html" || mimeType.startsWith("text/html;")) {
        htmlParts.push(this.decodeBase64UrlToUtf8(inlineData));
      }
    }

    for (const child of candidate.parts ?? []) {
      this.walkPart(child, plainParts, htmlParts);
    }
  }

  private decodeBase64UrlToUtf8(encoded: string): string {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf8");
  }
}
