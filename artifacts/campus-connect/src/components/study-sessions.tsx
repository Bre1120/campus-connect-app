import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek } from 'date-fns';
import { Clock3, Plus, Trash2 } from 'lucide-react';
import {
  getListStudySessionsQueryKey,
  useCreateStudySession, useDeleteStudySession, useListCourses, useListStudySessions,
  type StudySession,
} from '@workspace/api-client-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CourseTag } from '@/components/course-tag';
import { useToast } from '@/hooks/use-toast';

const quickMinutes = [15, 25, 45, 60];

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** Dashboard card: this week's logged study time by course, plus logging new sessions. */
export function StudySessionsCard() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Weeks start on Monday, matching the dashboard's weekly rhythm chart.
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const params = { from: weekStart };
  const sessions = useListStudySessions(params);
  const del = useDeleteStudySession();

  const list = sessions.data ?? [];
  const total = list.reduce((sum, session) => sum + session.minutes, 0);
  const byCourse = useMemo(() => {
    const totals = new Map<number, { code: string; name: string; color: string; minutes: number }>();
    for (const session of list) {
      const entry = totals.get(session.courseId) ?? { code: session.courseCode, name: session.courseName, color: session.courseColor, minutes: 0 };
      entry.minutes += session.minutes;
      totals.set(session.courseId, entry);
    }
    return [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  }, [list]);
  const most = byCourse[0]?.minutes ?? 0;

  const remove = (session: StudySession) => {
    if (!window.confirm(`Delete this ${formatMinutes(session.minutes)} ${session.courseCode} session?`)) return;
    del.mutate({ id: session.id }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getListStudySessionsQueryKey(params) });
        toast({ title: 'Session deleted' });
      },
      onError: () => toast({ title: 'Session was not deleted', description: 'Please try again.', variant: 'destructive' }),
    });
  };

  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" data-testid="card-study-sessions">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Study time this week</p>
        <h2 className="cc-display mt-1 text-2xl font-semibold" data-testid="text-study-total">{sessions.isLoading ? '—' : total ? formatMinutes(total) : 'Nothing logged yet'}</h2>
      </div>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md" data-testid="button-log-session">
        <Plus size={17} /> Log session
      </button>
    </div>

    {sessions.isError ? <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
      Couldn't load your study sessions. <button type="button" className="font-bold underline" onClick={() => sessions.refetch()}>Try again</button>
    </div> : null}

    {!sessions.isLoading && !sessions.isError && !list.length ? <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
      Finished a study block? Log it here to see where your time goes each week.
    </p> : null}

    {byCourse.length ? <div className="mt-5 space-y-3" data-testid="list-study-by-course">
      {byCourse.map(course => <div key={course.code}>
        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate"><CourseTag code={course.code} color={course.color} className="text-foreground" /> <span className="text-muted-foreground">· {course.name}</span></span>
          <span className="shrink-0 font-semibold">{formatMinutes(course.minutes)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: `${Math.max(4, (course.minutes / most) * 100)}%`, backgroundColor: course.color }} />
        </div>
      </div>)}
    </div> : null}

    {list.length ? <div className="mt-5 border-t border-border/70 pt-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Recent sessions</p>
      {list.slice(0, 5).map(session => <div key={session.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0" data-testid={`row-study-session-${session.id}`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Clock3 size={15} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold"><CourseTag code={session.courseCode} color={session.courseColor} /> · {formatMinutes(session.minutes)}</div>
          <div className="truncate text-xs text-muted-foreground">{format(parseISO(session.studiedOn), 'EEE, MMM d')}{session.note ? ` · ${session.note}` : ''}</div>
        </div>
        <button type="button" aria-label={`Delete ${session.courseCode} session`} onClick={() => remove(session)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-session-${session.id}`}><Trash2 size={15} /></button>
      </div>)}
    </div> : null}

    <LogSessionDialog open={open} onOpenChange={setOpen} onLogged={() => void client.invalidateQueries({ queryKey: getListStudySessionsQueryKey(params) })} />
  </section>;
}

function LogSessionDialog({ open, onOpenChange, onLogged }: { open: boolean; onOpenChange: (open: boolean) => void; onLogged: () => void }) {
  const { toast } = useToast();
  const courses = useListCourses();
  const create = useCreateStudySession();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [courseId, setCourseId] = useState('');
  const [minutes, setMinutes] = useState('25');
  const [studiedOn, setStudiedOn] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCourseId(current => current || String(courses.data?.[0]?.id ?? ''));
    setMinutes('25');
    setStudiedOn(format(new Date(), 'yyyy-MM-dd'));
    setNote('');
    setError('');
  }, [open, courses.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const count = Number(minutes);
    if (!courseId) return setError('Pick a course.');
    if (!Number.isInteger(count) || count < 1 || count > 600) return setError('Enter between 1 and 600 minutes.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(studiedOn) || studiedOn > today) return setError('Choose today or an earlier day.');
    setError('');
    try {
      await create.mutateAsync({ data: { courseId: Number(courseId), minutes: count, studiedOn, note: note.trim() || null } });
      onLogged();
      onOpenChange(false);
      toast({ title: 'Study session logged', description: `${formatMinutes(count)} added to your week.` });
    } catch {
      setError('Your session was not saved. Please try again.');
    }
  };

  const saving = create.isPending;
  return <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}>
    <DialogContent className="rounded-2xl border-card-border bg-card p-0 sm:max-w-[480px]">
      <DialogHeader className="border-b border-border bg-secondary/35 px-6 py-5 text-left">
        <DialogTitle className="cc-display text-2xl">Log a study session</DialogTitle>
        <DialogDescription>Record time you spent studying so your week adds up.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4 px-6 py-5" noValidate>
        <label className="block space-y-2 text-sm font-medium">
          <span>Course</span>
          <select className="field" value={courseId} onChange={event => setCourseId(event.target.value)} disabled={saving} data-testid="select-session-course">
            <option value="">Select a course</option>
            {(courses.data ?? []).map(course => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
          </select>
        </label>
        <div className="space-y-2 text-sm font-medium">
          <label htmlFor="session-minutes">Minutes</label>
          <div className="flex flex-wrap gap-2">
            {quickMinutes.map(value => <button type="button" key={value} onClick={() => setMinutes(String(value))} className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${minutes === String(value) ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`} data-testid={`button-minutes-${value}`}>{value}</button>)}
            <input id="session-minutes" type="number" inputMode="numeric" min={1} max={600} className="field w-24 flex-none" value={minutes} onChange={event => setMinutes(event.target.value)} disabled={saving} data-testid="input-session-minutes" />
          </div>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          <span>Day</span>
          <input type="date" className="field" value={studiedOn} max={today} onChange={event => setStudiedOn(event.target.value)} disabled={saving} data-testid="input-session-date" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Note <span className="font-normal text-muted-foreground">(optional)</span></span>
          <textarea className="field min-h-20 resize-y" maxLength={500} placeholder="e.g. Reviewed chapter 6 flashcards" value={note} onChange={event => setNote(event.target.value)} disabled={saving} data-testid="textarea-session-note" />
        </label>
        {error ? <p className="text-sm font-medium text-destructive" role="alert" data-testid="text-session-error">{error}</p> : null}
        <DialogFooter className="gap-2 pt-2">
          <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm" data-testid="button-save-session">{saving ? 'Saving...' : 'Log session'}</button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
