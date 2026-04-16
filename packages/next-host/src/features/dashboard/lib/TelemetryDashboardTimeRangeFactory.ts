import {
  subHours,
  subMinutes,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import type {
  TelemetryDashboardBucketIntervalDto,
  TelemetryDashboardFiltersDto,
  TelemetryDashboardTimeseriesRequestDto,
} from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";

export type TelemetryDashboardTimePreset =
  | "last_5_minutes"
  | "last_15_minutes"
  | "last_30_minutes"
  | "last_hour"
  | "last_4_hours"
  | "last_8_hours"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_2_weeks"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export interface TelemetryDashboardTimeRangeSelection {
  readonly preset: TelemetryDashboardTimePreset;
  readonly customStart?: string;
  readonly customEnd?: string;
}

export class TelemetryDashboardTimeRangeFactory {
  static createRequest(
    selection: TelemetryDashboardTimeRangeSelection,
    filters: TelemetryDashboardFiltersDto,
    now: Date = new Date(),
  ): TelemetryDashboardTimeseriesRequestDto | null {
    const range = this.createRange(selection, now);
    if (!range) {
      return null;
    }
    return {
      interval: range.interval,
      filters: {
        ...filters,
        startTimeGte: range.startTimeGte,
        endTimeLte: range.endTimeLte,
      },
    };
  }

  static createRange(
    selection: TelemetryDashboardTimeRangeSelection,
    now: Date = new Date(),
  ): Readonly<{ startTimeGte: string; endTimeLte: string; interval: TelemetryDashboardBucketIntervalDto }> | null {
    if (selection.preset === "custom") {
      if (!selection.customStart || !selection.customEnd) {
        return null;
      }
      const start = new Date(selection.customStart);
      const end = new Date(selection.customEnd);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return null;
      }
      return {
        startTimeGte: start.toISOString(),
        endTimeLte: end.toISOString(),
        interval: this.resolveInterval(start, end),
      };
    }
    const [start, end, interval] = this.createPresetRange(selection.preset, now);
    return {
      startTimeGte: start.toISOString(),
      endTimeLte: end.toISOString(),
      interval,
    };
  }

  private static createPresetRange(
    preset: Exclude<TelemetryDashboardTimePreset, "custom">,
    now: Date,
  ): readonly [Date, Date, TelemetryDashboardBucketIntervalDto] {
    if (preset === "last_5_minutes") {
      return [subMinutes(now, 5), now, "minute_5"] as const;
    }
    if (preset === "last_15_minutes") {
      return [subMinutes(now, 15), now, "minute_5"] as const;
    }
    if (preset === "last_30_minutes") {
      return [subMinutes(now, 30), now, "minute_5"] as const;
    }
    if (preset === "last_hour") {
      return [subHours(now, 1), now, "minute_15"] as const;
    }
    if (preset === "last_4_hours") {
      return [subHours(now, 4), now, "minute_15"] as const;
    }
    if (preset === "last_8_hours") {
      return [subHours(now, 8), now, "hour"] as const;
    }
    if (preset === "today") {
      return [startOfDay(now), endOfDay(now), "hour"] as const;
    }
    if (preset === "yesterday") {
      const yesterday = subDays(now, 1);
      return [startOfDay(yesterday), endOfDay(yesterday), "hour"] as const;
    }
    if (preset === "this_week") {
      return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }), "day"] as const;
    }
    if (preset === "last_2_weeks") {
      return [startOfWeek(subDays(now, 13), { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 }), "day"] as const;
    }
    if (preset === "this_month") {
      return [startOfMonth(now), endOfMonth(now), "day"] as const;
    }
    if (preset === "this_quarter") {
      return [startOfQuarter(now), endOfQuarter(now), "week"] as const;
    }
    return [startOfYear(now), endOfYear(now), "week"] as const;
  }

  private static resolveInterval(start: Date, end: Date): TelemetryDashboardBucketIntervalDto {
    const durationMs = end.getTime() - start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    const durationDays = durationMs / (1000 * 60 * 60 * 24);
    if (durationHours <= 2) {
      return "minute_5";
    }
    if (durationHours <= 12) {
      return "minute_15";
    }
    if (durationDays <= 2) {
      return "hour";
    }
    if (durationDays <= 45) {
      return "day";
    }
    return "week";
  }
}
