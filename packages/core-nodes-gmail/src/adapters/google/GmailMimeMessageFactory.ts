import type { GmailSendMessageArgs } from "../../services/GmailApiClient";

export class GmailMimeMessageFactory {
  createMessage(args: GmailSendMessageArgs): string {
    const lines: string[] = [];
    const attachments = args.attachments ?? [];
    const hasText = typeof args.text === "string" && args.text.length > 0;
    const hasHtml = typeof args.html === "string" && args.html.length > 0;
    const alternativeBoundary = hasText && hasHtml ? this.createBoundary("alternative") : undefined;
    const mixedBoundary = attachments.length > 0 ? this.createBoundary("mixed") : undefined;
    lines.push(`To: ${args.to.join(", ")}`);
    if (args.cc && args.cc.length > 0) {
      lines.push(`Cc: ${args.cc.join(", ")}`);
    }
    if (args.bcc && args.bcc.length > 0) {
      lines.push(`Bcc: ${args.bcc.join(", ")}`);
    }
    if (args.replyTo) {
      lines.push(`Reply-To: ${args.replyTo}`);
    }
    if (args.from) {
      lines.push(`From: ${args.from}`);
    }
    lines.push(`Subject: ${this.encodeHeaderValue(args.subject)}`);
    lines.push("MIME-Version: 1.0");
    for (const [key, value] of Object.entries(args.headers ?? {})) {
      lines.push(`${key}: ${value}`);
    }
    if (mixedBoundary) {
      lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      lines.push("");
      lines.push(...this.createBodyParts({ args, mixedBoundary, alternativeBoundary }));
    } else {
      lines.push(...this.createSingleBodyPart({ text: args.text, html: args.html, alternativeBoundary }));
    }
    return this.encodeBase64Url(lines.join("\r\n"));
  }

  private createBodyParts(
    args: Readonly<{
      args: GmailSendMessageArgs;
      mixedBoundary: string;
      alternativeBoundary?: string;
    }>,
  ): ReadonlyArray<string> {
    const lines: string[] = [];
    for (const line of this.createSingleBodyPart({
      text: args.args.text,
      html: args.args.html,
      alternativeBoundary: args.alternativeBoundary,
      boundaryPrefix: args.mixedBoundary,
    })) {
      lines.push(line);
    }
    for (const attachment of args.args.attachments ?? []) {
      lines.push(`--${args.mixedBoundary}`);
      lines.push(`Content-Type: ${attachment.mimeType}; name="${this.escapeQuotedValue(attachment.filename)}"`);
      lines.push(
        `Content-Disposition: ${attachment.disposition ?? "attachment"}; filename="${this.escapeQuotedValue(attachment.filename)}"`,
      );
      lines.push(`Content-Transfer-Encoding: ${attachment.contentTransferEncoding ?? "base64"}`);
      if (attachment.contentId) {
        lines.push(`Content-ID: <${attachment.contentId}>`);
      }
      lines.push("");
      lines.push(this.toBase64Body(attachment.body));
    }
    lines.push(`--${args.mixedBoundary}--`);
    return lines;
  }

  private createSingleBodyPart(
    args: Readonly<{
      text?: string;
      html?: string;
      alternativeBoundary?: string;
      boundaryPrefix?: string;
    }>,
  ): ReadonlyArray<string> {
    const lines: string[] = [];
    if (args.boundaryPrefix) {
      lines.push(`--${args.boundaryPrefix}`);
    }
    if (args.alternativeBoundary) {
      lines.push(`Content-Type: multipart/alternative; boundary="${args.alternativeBoundary}"`);
      lines.push("");
      if (typeof args.text === "string" && args.text.length > 0) {
        lines.push(`--${args.alternativeBoundary}`);
        lines.push('Content-Type: text/plain; charset="UTF-8"');
        lines.push("Content-Transfer-Encoding: 8bit");
        lines.push("");
        lines.push(args.text);
      }
      if (typeof args.html === "string" && args.html.length > 0) {
        lines.push(`--${args.alternativeBoundary}`);
        lines.push('Content-Type: text/html; charset="UTF-8"');
        lines.push("Content-Transfer-Encoding: 8bit");
        lines.push("");
        lines.push(args.html);
      }
      lines.push(`--${args.alternativeBoundary}--`);
      return lines;
    }
    const hasHtml = typeof args.html === "string" && args.html.length > 0;
    lines.push(`Content-Type: ${hasHtml ? "text/html" : "text/plain"}; charset="UTF-8"`);
    lines.push("Content-Transfer-Encoding: 8bit");
    lines.push("");
    lines.push((hasHtml ? args.html : args.text) ?? "");
    return lines;
  }

  private encodeHeaderValue(value: string): string {
    return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
  }

  private escapeQuotedValue(value: string): string {
    return value.replace(/"/g, '\\"');
  }

  private toBase64Body(value: Uint8Array | string): string {
    return Buffer.from(typeof value === "string" ? value : value).toString("base64");
  }

  private encodeBase64Url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  private createBoundary(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
  }
}
