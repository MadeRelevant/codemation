"use client";

import { CanvasNodeChromeTooltip } from "../../workflows/components/canvas/CanvasNodeChromeTooltip";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function CredentialEnvFieldStatusRow(
  args: Readonly<
    | {
        kind: "managed";
        envVarName: string;
        fieldKey: string;
      }
    | {
        kind: "missing";
        envVarName: string;
        fieldKey: string;
      }
  >,
) {
  const { envVarName, fieldKey } = args;
  const mono = <span className="font-mono font-semibold text-foreground">{envVarName}</span>;

  if (args.kind === "managed") {
    const tooltip =
      "This value is provided by the host environment variable. It overrides anything stored in the database for this field.";
    return (
      <div
        className="flex items-start gap-2 rounded-md border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-2 text-xs leading-snug text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100"
        data-testid={`credential-field-env-managed-${fieldKey}`}
      >
        <CanvasNodeChromeTooltip
          testId={`credential-field-env-managed-icon-${fieldKey}`}
          ariaLabel="Host environment configured"
          tooltip={tooltip}
        >
          <span className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
          </span>
        </CanvasNodeChromeTooltip>
        <span>Managed by env {mono}</span>
      </div>
    );
  }

  const tooltip =
    "This variable is not set (or is empty) in the host process environment. Enter a value below to store it in the database, or set the variable on the host to centralize secrets.";
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-xs leading-snug text-destructive dark:border-destructive/40 dark:bg-destructive/10"
      data-testid={`credential-field-env-missing-${fieldKey}`}
    >
      <CanvasNodeChromeTooltip
        testId={`credential-field-env-missing-icon-${fieldKey}`}
        ariaLabel="Host environment not set"
        tooltip={tooltip}
      >
        <span className="inline-flex shrink-0 text-destructive">
          <AlertCircle className="size-4" aria-hidden />
        </span>
      </CanvasNodeChromeTooltip>
      <span>Not set in host env: {mono}</span>
    </div>
  );
}
