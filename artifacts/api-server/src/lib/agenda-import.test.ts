import { strict as assert } from "node:assert";
import { test } from "node:test";
import { agendaEntryKey, isCalendarDate, normalizeCourseCode } from "./agenda-import";

test("course matching ignores whitespace and letter case", () => {
  assert.equal(normalizeCourseCode(" ent 3273 "), normalizeCourseCode("ENT3273"));
});

test("duplicate keys preserve deadlines and normalize title whitespace/case", () => {
  assert.equal(agendaEntryKey(" Quiz 9:  Ratios ", "2026-10-02"), agendaEntryKey("quiz 9: ratios", "2026-10-02"));
  assert.notEqual(agendaEntryKey("Quiz 9: Ratios", "2026-10-02"), agendaEntryKey("Quiz 9: Ratios", "2026-10-09"));
});

test("date validation rejects rollover dates and never shifts calendar days", () => {
  for (const date of ["2026-10-02", "2026-10-09", "2026-10-23", "2026-11-16", "2028-02-29"]) {
    assert.equal(isCalendarDate(date), true);
  }
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-02", "0000-01-01", "10/2/26"]) {
    assert.equal(isCalendarDate(date), false);
  }
});