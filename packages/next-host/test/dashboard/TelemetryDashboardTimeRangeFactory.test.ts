import assert from "node:assert/strict";
import { test } from "vitest";

import { TelemetryDashboardTimeRangeFactory } from "../../src/features/dashboard/lib/TelemetryDashboardTimeRangeFactory";

const NOW = new Date("2026-05-15T12:00:00.000Z");

test("last_5_minutes preset returns minute_5 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_5_minutes" }, NOW);
  assert.equal(range?.interval, "minute_5");
  assert.ok(new Date(range!.startTimeGte) < NOW);
});

test("last_30_minutes preset returns minute_5 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_30_minutes" }, NOW);
  assert.equal(range?.interval, "minute_5");
});

test("last_hour preset returns minute_15 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_hour" }, NOW);
  assert.equal(range?.interval, "minute_15");
});

test("last_4_hours preset returns minute_15 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_4_hours" }, NOW);
  assert.equal(range?.interval, "minute_15");
});

test("last_8_hours preset returns hour interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_8_hours" }, NOW);
  assert.equal(range?.interval, "hour");
});

test("today preset returns hour interval spanning the current day", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "today" }, NOW);
  assert.equal(range?.interval, "hour");
  assert.ok(new Date(range!.startTimeGte) <= NOW);
  assert.ok(new Date(range!.endTimeLte) >= NOW);
});

test("this_week preset returns day interval spanning the current week", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "this_week" }, NOW);
  assert.equal(range?.interval, "day");
  assert.ok(new Date(range!.startTimeGte) <= NOW);
  assert.ok(new Date(range!.endTimeLte) >= NOW);
});

test("last_2_weeks preset returns day interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_2_weeks" }, NOW);
  assert.equal(range?.interval, "day");
});

test("this_month preset returns day interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "this_month" }, NOW);
  assert.equal(range?.interval, "day");
});

test("this_quarter preset returns week interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "this_quarter" }, NOW);
  assert.equal(range?.interval, "week");
});

test("custom range with 3-hour duration uses minute_15 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-05-15T09:00:00.000Z",
    customEnd: "2026-05-15T12:00:00.000Z",
  });
  assert.equal(range?.interval, "minute_15");
});

test("custom range with ~1-day duration uses hour interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-05-14T00:00:00.000Z",
    customEnd: "2026-05-15T12:00:00.000Z",
  });
  assert.equal(range?.interval, "hour");
});

test("custom range with 20-day duration uses day interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-05-01T00:00:00.000Z",
    customEnd: "2026-05-21T00:00:00.000Z",
  });
  assert.equal(range?.interval, "day");
});

test("custom range with invalid start date returns null", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "not-a-date",
    customEnd: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(range, null);
});

test("custom range with no customStart returns null", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "custom" });
  assert.equal(range, null);
});

test("last_15_minutes preset returns minute_5 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "last_15_minutes" }, NOW);
  assert.equal(range?.interval, "minute_5");
  assert.ok(new Date(range!.startTimeGte) < NOW);
});

test("yesterday preset returns hour interval spanning the previous day", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "yesterday" }, NOW);
  assert.equal(range?.interval, "hour");
  // yesterday's range should end before today's start
  assert.ok(new Date(range!.endTimeLte) < NOW);
});

test("this_year preset returns week interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({ preset: "this_year" }, NOW);
  assert.equal(range?.interval, "week");
  assert.ok(new Date(range!.startTimeGte) <= NOW);
  assert.ok(new Date(range!.endTimeLte) >= NOW);
});

test("custom range with 1-hour duration uses minute_5 interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-05-15T11:00:00.000Z",
    customEnd: "2026-05-15T12:00:00.000Z",
  });
  assert.equal(range?.interval, "minute_5");
});

test("custom range with 60-day duration uses week interval", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-03-15T00:00:00.000Z",
    customEnd: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(range?.interval, "week");
});

test("createRequest returns full request DTO with filters merged", () => {
  const result = TelemetryDashboardTimeRangeFactory.createRequest(
    { preset: "last_5_minutes" },
    { workflowId: "wf-1" },
    NOW,
  );
  assert.ok(result !== null);
  assert.equal(result!.interval, "minute_5");
  assert.equal(result!.filters.workflowId, "wf-1");
  assert.ok(result!.filters.startTimeGte);
  assert.ok(result!.filters.endTimeLte);
});

test("createRequest returns null when custom range has no dates", () => {
  const result = TelemetryDashboardTimeRangeFactory.createRequest({ preset: "custom" }, {});
  assert.equal(result, null);
});

test("custom range where start equals end returns null", () => {
  const range = TelemetryDashboardTimeRangeFactory.createRange({
    preset: "custom",
    customStart: "2026-05-15T00:00:00.000Z",
    customEnd: "2026-05-14T00:00:00.000Z",
  });
  assert.equal(range, null);
});
