"use client";

import type { Locale } from "date-fns";
import { format,isValid,parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import type { ReactNode } from "react";

export type CodemationFormattedDateTimeProps = Readonly<{
  /** ISO 8601 instant (e.g. from API). */
  isoUtc: string | null | undefined;
  /** Shown when `isoUtc` is missing or unparsable. */
  fallbackText?: string;
  /** Reserved for localization; defaults to `enUS`. */
  locale?: Locale;
  dataTestId?: string;
  className?: string;
}>;

/**
 * Renders a human-readable date/time via **date-fns** (`format` + `parseISO`).
 * Pass a different `locale` when you wire i18n.
 */
export function CodemationFormattedDateTime(props: CodemationFormattedDateTimeProps): ReactNode {
  const { isoUtc, fallbackText = "—", locale = enUS, dataTestId, className } = props;
  if (!isoUtc?.trim()) {
    return (
      <span className={className} data-testid={dataTestId}>
        {fallbackText}
      </span>
    );
  }
  const parsed = parseISO(isoUtc);
  if (!isValid(parsed)) {
    return (
      <span className={className} data-testid={dataTestId}>
        {fallbackText}
      </span>
    );
  }
  const label = format(parsed, "PPp", { locale });
  return (
    <time className={className} dateTime={isoUtc} data-testid={dataTestId} title={isoUtc}>
      {label}
    </time>
  );
}
