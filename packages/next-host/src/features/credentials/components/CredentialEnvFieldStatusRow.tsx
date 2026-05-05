"use client";

import { CanvasNodeChromeTooltip } from "../../workflows/components/canvas/CanvasNodeChromeTooltip";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import Info from "lucide-react/dist/esm/icons/info";

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
    "Optional: set this variable on the host to centralize the secret across deployments. The value entered below is stored in the database and works on its own.";
  return (
    <div
      className="text-muted-foreground bg-muted/40 dark:bg-muted/20 flex items-start gap-2 rounded-md border border-border/60 px-2.5 py-2 text-xs leading-snug"
      data-testid={`credential-field-env-missing-${fieldKey}`}
    >
      <CanvasNodeChromeTooltip
        testId={`credential-field-env-missing-icon-${fieldKey}`}
        ariaLabel="Host environment override available"
        tooltip={tooltip}
      >
        <span className="inline-flex shrink-0 text-muted-foreground">
          <Info className="size-4" aria-hidden />
        </span>
      </CanvasNodeChromeTooltip>
      <span>Tip: this field can also be supplied via host env {mono} to keep the secret out of the database.</span>
    </div>
  );
}
