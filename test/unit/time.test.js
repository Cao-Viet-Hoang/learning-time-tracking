import "./setup.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  formatClock,
  formatDuration,
  formatHours,
  isDateKey,
  isTimeString,
  minutesToTime,
  rangeKeys,
  spanMinutes,
  startOfWeek,
  timeToMinutes,
  weekdayIndex,
} from "../../js/utils/time.js";

test("isDateKey accepts real dates only", () => {
  assert.equal(isDateKey("2026-02-28"), true);
  assert.equal(isDateKey("2026-02-29"), false);
  assert.equal(isDateKey("2028-02-29"), true);
  assert.equal(isDateKey("2026-13-01"), false);
  assert.equal(isDateKey("26-1-1"), false);
  assert.equal(isDateKey(""), false);
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("addMonths clamps to the last day of shorter months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
});

test("diffDays and rangeKeys agree", () => {
  assert.equal(diffDays("2026-10-01", "2026-10-10"), 9);
  assert.equal(diffDays("2026-10-10", "2026-10-01"), -9);
  const keys = rangeKeys("2026-10-29", "2026-11-02");
  assert.deepEqual(keys, ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(keys.length, diffDays("2026-10-29", "2026-11-02") + 1);
});

test("weeks start on Monday", () => {
  assert.equal(startOfWeek("2026-10-10"), "2026-10-05"); // Saturday -> Monday
  assert.equal(startOfWeek("2026-10-05"), "2026-10-05");
  assert.equal(startOfWeek("2026-10-11"), "2026-10-05"); // Sunday belongs to the same week
  assert.equal(weekdayIndex("2026-10-05"), 0);
  assert.equal(weekdayIndex("2026-10-11"), 6);
});

test("endOfMonth handles leap years", () => {
  assert.equal(endOfMonth("2028-02-10"), "2028-02-29");
  assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
  assert.equal(endOfMonth("2026-12-01"), "2026-12-31");
});

test("time strings round-trip and spans wrap past midnight", () => {
  assert.equal(isTimeString("23:59"), true);
  assert.equal(isTimeString("24:00"), false);
  assert.equal(isTimeString("9:00"), false);
  assert.equal(timeToMinutes("01:30"), 90);
  assert.equal(minutesToTime(90), "01:30");
  assert.equal(minutesToTime(-30), "23:30");
  assert.equal(spanMinutes("09:00", "10:15"), 75);
  assert.equal(spanMinutes("23:30", "00:15"), 45);
});

test("duration and clock formatting", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(135), "2h 15m");
  assert.equal(formatDuration(-5), "0m");
  assert.equal(formatHours(90), "1.5h");
  assert.equal(formatHours(6000), "100h");
  assert.equal(formatClock(0), "00:00:00");
  assert.equal(formatClock(3_725_999), "01:02:05");
  assert.equal(formatClock(-1000), "00:00:00");
});
