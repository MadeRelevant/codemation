export class DashboardCostAmountFormatter {
  static normalizeAmount(args: Readonly<{ amountMinor: number; currencyScale: number }>): number {
    return args.currencyScale > 0 ? args.amountMinor / args.currencyScale : args.amountMinor;
  }

  static format(args: Readonly<{ currency: string; amountMinor: number; currencyScale: number }>): string {
    const normalizedAmount = this.normalizeAmount(args);
    const fractionDigits = args.currencyScale > 1 ? Math.min(9, Math.max(2, String(args.currencyScale).length - 1)) : 2;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: args.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: fractionDigits,
    }).format(normalizedAmount);
  }

  static formatTotals(
    totals:
      | ReadonlyArray<Readonly<{ currency: string; currencyScale: number; estimatedCostMinor: number }>>
      | undefined,
  ): string {
    if (!totals || totals.length === 0) {
      return "—";
    }
    const totalsByCurrency = new Map<string, { currency: string; currencyScale: number; amountMinor: number }>();
    for (const total of totals) {
      const key = `${total.currency}:${String(total.currencyScale)}`;
      const current = totalsByCurrency.get(key);
      if (current) {
        current.amountMinor += total.estimatedCostMinor;
        continue;
      }
      totalsByCurrency.set(key, {
        currency: total.currency,
        currencyScale: total.currencyScale,
        amountMinor: total.estimatedCostMinor,
      });
    }
    return [...totalsByCurrency.values()]
      .map((total) =>
        this.format({
          currency: total.currency,
          currencyScale: total.currencyScale,
          amountMinor: total.amountMinor,
        }),
      )
      .join(" · ");
  }
}
