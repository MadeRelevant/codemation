"use client";

import { Button } from "@codemation/ui";
import ClipboardCopy from "lucide-react/dist/esm/icons/clipboard-copy";
import { useCallback, useState } from "react";

export function CredentialFieldCopyButton(
  args: Readonly<{
    value: string;
    /** Default: Copy */
    label?: string;
    testId: string;
  }>,
) {
  const { label = "Copy", testId, value } = args;
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (!value.trim()) {
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => {
          setCopied(false);
        }, 1600);
      } catch {
        setCopied(false);
      }
    })();
  }, [value]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 gap-1.5 px-2 text-xs font-semibold leading-none"
      data-testid={testId}
      disabled={!value.trim()}
      onClick={handleCopy}
    >
      <ClipboardCopy className="size-3.5 shrink-0" aria-hidden />
      {copied ? "Copied" : label}
    </Button>
  );
}
