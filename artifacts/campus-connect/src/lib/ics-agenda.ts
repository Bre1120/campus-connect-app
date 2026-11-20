/**
 * Turns a calendar (.ics) file — such as the Canvas "Calendar Feed" — into agendas
 * the importer can review, one per course. Runs entirely in the browser.
 *
 * Canvas puts the course in brackets at the end of each event title, e.g.
 * "Lab Report 1 [BSC1010C-80431]". Events without a course are left out.
 */

export type IcsTask = {
  title: string;
  type: 'assignment' | 'exam' | 'project' | 'reading' | 'other';
  dueDate: string;
  dueTime: string | null;
  priority: 'low' | 'medium' | 'high';
  notes: string | null;
  /** Past deadlines come in already checked off. */
  completed: boolean;
};
export type IcsAgenda = { course: { code: string; name: string }; tasks: IcsTask[] };
export type IcsParseResult = {
  /** Upcoming deadlines only. */
  agendas: IcsAgenda[];
  /** Upcoming and past deadlines; past ones are marked completed. */
  agendasWithPast: IcsAgenda[];
  pastCount: number;
  noCourseCount: number;
  overLimitCount: number;
};

const MAX_TASKS = 100;
const MAX_NOTE = 1000;

type RawEvent = { props: Map<string, { params: string; value: string }> };

function unfold(text: string) {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) => (char === 'n' || char === 'N' ? '\n' : char));
}

function readEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) { current = { props: new Map() }; continue; }
    if (/^END:VEVENT$/i.test(line.trim())) { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const head = line.slice(0, colon);
    const semi = head.indexOf(';');
    const name = (semi === -1 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi === -1 ? '' : head.slice(semi + 1);
    if (!current.props.has(name)) current.props.set(name, { params, value: line.slice(colon + 1) });
  }
  return events;
}

const pad = (value: number) => String(value).padStart(2, '0');
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** DTSTART/DUE → the student's local day and time. UTC ("Z") times are converted to this browser's time zone. */
export function parseIcsDate(value: string, params = ''): { dueDate: string; dueTime: string | null } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, , utc] = match;
  if (!h || /VALUE=DATE(?!-)/i.test(params)) return { dueDate: `${y}-${mo}-${d}`, dueTime: null };
  if (utc) {
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    return { dueDate: localDay(date), dueTime: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
  }
  // Floating or TZID times: keep the wall-clock time as written.
  return { dueDate: `${y}-${mo}-${d}`, dueTime: `${h}:${mi}` };
}

/** "BSC1010C-80431" or "ENT 3503 Social Entrepreneurship" → a short code like "BSC 1010C". */
export function courseCodeFrom(label: string) {
  const match = /\b([A-Z]{3})\s?-?(\d{4}[A-Z]?)\b/i.exec(label);
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : label.slice(0, 40).trim();
}

export function guessType(title: string, uid: string): IcsTask['type'] {
  // Ignore asides like "(Please complete during the Final Exam session)".
  const core = title.replace(/\([^)]*\)/g, ' ');
  if (/^\W*(assignment|homework|hw)\b/i.test(core)) return 'assignment';
  if (/\b(project|presentation|capstone)\b/i.test(core)) return 'project';
  if (/\b(exam|midterm|quiz|test)\b/i.test(core)) return 'exam';
  if (/\b(read|reading|chapter|ch\.)\b/i.test(core)) return 'reading';
  if (/assignment/i.test(uid) || /\b(assignment|homework|hw|essay|paper|lab|discussion|report|reflection)\b/i.test(core)) return 'assignment';
  return 'other';
}

/** Exams and anything marked final are high priority. */
export function guessPriority(title: string, type: IcsTask['type']): IcsTask['priority'] {
  return type === 'exam' || /\bfinal\b/i.test(title) ? 'high' : 'medium';
}

function buildNotes(description: string, url: string) {
  const text = description.replace(/\n{3,}/g, '\n\n').trim();
  const clipped = text.length > MAX_NOTE ? `${text.slice(0, MAX_NOTE - 1).trimEnd()}…` : text;
  const link = /^https:\/\//i.test(url) ? `Open in Canvas: ${url}` : '';
  return [clipped, link].filter(Boolean).join('\n\n').slice(0, 2000) || null;
}

/** Parse an .ics file into one agenda per course, with and without past deadlines. */
export function parseIcsAgendas(text: string, today: string): IcsParseResult {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('This is not a calendar (.ics) file.');
  const groups = new Map<string, IcsAgenda>();
  const labels = new Map<string, string>();
  const seen = new Set<string>();
  let pastCount = 0;
  let noCourseCount = 0;
  let overLimitCount = 0;

  for (const event of readEvents(text)) {
    const get = (name: string) => event.props.get(name);
    const uid = get('UID')?.value ?? '';
    const summary = unescapeText(get('SUMMARY')?.value ?? '').trim();
    const start = get('DUE') ?? get('DTSTART');
    if (!summary || !start) continue;
    const when = parseIcsDate(start.value, start.params);
    if (!when) continue;

    const bracket = /^(.*\S)\s*\[([^\]]+)\]\s*$/.exec(summary);
    if (!bracket) { noCourseCount += 1; continue; }
    const title = bracket[1].slice(0, 300);
    const label = bracket[2].trim();

    const key = uid || `${summary}|${when.dueDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const completed = when.dueDate < today;
    if (completed) pastCount += 1;

    const code = courseCodeFrom(label);
    if (!labels.has(code)) labels.set(code, label.slice(0, 140));
    const group = groups.get(code) ?? { course: { code, name: labels.get(code)! }, tasks: [] };
    const type = guessType(title, uid);
    group.tasks.push({
      title, type, ...when,
      priority: guessPriority(title, type),
      notes: buildNotes(unescapeText(get('DESCRIPTION')?.value ?? ''), get('URL')?.value ?? ''),
      completed,
    });
    groups.set(code, group);
  }

  const build = (includePast: boolean) => [...groups.values()].map(group => {
    let tasks = group.tasks.filter(task => includePast || !task.completed);
    tasks = [...tasks].sort((a, b) => `${a.dueDate} ${a.dueTime ?? '99'}`.localeCompare(`${b.dueDate} ${b.dueTime ?? '99'}`));
    if (tasks.length > MAX_TASKS) {
      // Keep the most recent and upcoming deadlines when a course has more than the limit.
      if (includePast) overLimitCount += tasks.length - MAX_TASKS;
      tasks = includePast ? tasks.slice(-MAX_TASKS) : tasks.slice(0, MAX_TASKS);
    }
    return { course: group.course, tasks };
  }).filter(group => group.tasks.length).sort((a, b) => a.course.code.localeCompare(b.course.code));

  const agendas = build(false);
  const agendasWithPast = build(true);
  return { agendas, agendasWithPast, pastCount, noCourseCount, overLimitCount };
}
