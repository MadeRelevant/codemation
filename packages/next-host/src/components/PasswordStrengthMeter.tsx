"use client";

import { useMemo, type ReactNode } from "react";
import zxcvbn from "zxcvbn";

import { cn } from "@/lib/utils";

export type PasswordStrengthMeterProps = Readonly<{
  password: string;
  /** Skips scoring (and layout) when false. */
  enabled?: boolean;
  dataTestId?: string;
}>;

const scoreLabels = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

/**
 * Password strength using **zxcvbn** (Dropbox). Not a policy gate — server still enforces min length.
 */
export function PasswordStrengthMeter(props: PasswordStrengthMeterProps): ReactNode {
  const { password, enabled = true, dataTestId = "password-strength-meter" } = props;
  const result = useMemo(() => {
    if (!enabled || password.length === 0) return null;
    return zxcvbn(password);
  }, [enabled, password]);

  if (!enabled || password.length === 0 || !result) {
    return null;
  }

  const { score, feedback } = result;
  const hint = feedback.warning || (feedback.suggestions[0] ?? "");
  const label = scoreLabels[Math.min(score, 4)] ?? scoreLabels[0];

  const barClass = (i: number) =>
    cn(
      "h-1.5 flex-1 rounded-sm bg-muted transition-colors",
      i <= score &&
        (score <= 1 ? "bg-destructive" : score <= 3 ? "bg-amber-500" : "bg-emerald-600 dark:bg-emerald-500"),
    );

  return (
    <div className="flex flex-col gap-1.5" data-testid={dataTestId} role="status" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {([0, 1, 2, 3, 4] as const).map((i) => (
          <span key={i} className={barClass(i)} />
        ))}
      </div>
      <span className="text-xs font-medium text-foreground" data-testid={`${dataTestId}-label`}>
        {label}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground" data-testid={`${dataTestId}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
