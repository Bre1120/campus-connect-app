export function normalizeCourseCode(code: string) {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function agendaEntryKey(title: string, dueDate: string) {
  return JSON.stringify([title.trim().replace(/\s+/g, " ").toLowerCase(), dueDate]);
}

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}