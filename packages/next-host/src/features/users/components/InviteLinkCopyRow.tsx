"use client";

import { Button } from "@/components/ui/button";
import { ClipboardCopy } from "lucide-react";

type InviteLinkCopyRowProps = Readonly<{
  url: string;
  copyFeedback: boolean;
  onCopy: () => void;
  linkTestId: string;
  copyTestId: string;
}>;

export function InviteLinkCopyRow({ url, copyFeedback, onCopy, linkTestId, copyTestId }: InviteLinkCopyRowProps) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border border-input bg-muted/30 p-1 pl-3">
      <div className="min-w-0 flex-1 py-2">
        <div
          className="overflow-x-auto overflow-y-hidden whitespace-nowrap font-mono text-xs leading-relaxed text-foreground [scrollbar-width:thin]"
          data-testid={linkTestId}
          data-invite-link-layout="single-line-scroll"
          title="Scroll horizontally if needed — the URL is one continuous string (no spaces)."
        >
          {url}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-0.5 shrink-0 gap-1.5 px-3"
        data-testid={copyTestId}
        aria-label={copyFeedback ? "Copied to clipboard" : "Copy invite link"}
        disabled={copyFeedback}
        onClick={onCopy}
      >
        <ClipboardCopy className="size-3.5 shrink-0" aria-hidden />
        {copyFeedback ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
