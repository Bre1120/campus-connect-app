import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { AlertTriangle, Check } from 'lucide-react';
import {
  getGetDashboardQueryKey, getListTasksQueryKey,
  useListTasks, useToggleTaskCompletion, useUpdateTask,
  type Task,
} from '@workspace/api-client-react';
import { CourseTag } from '@/components/course-tag';
import { useToast } from '@/hooks/use-toast';

function overdueLabel(dueDate: string, today: Date) {
  const days = differenceInCalendarDays(today, parseISO(dueDate));
  return days === 1 ? 'Due yesterday' : `${days} days overdue`;
}

/** Dashboard card listing unfinished past-due tasks, with one-tap done / move actions. Renders nothing when none are overdue. */
export function OverdueTasksCard() {
  const client = useQueryClient();
  const { toast } = useToast();
  const tasks = useListTasks({ status: 'active' });
  const toggle = useToggleTaskCompletion();
  const update = useUpdateTask();
  const [busyId, setBusyId] = useState<number | null>(null);

  // "Today" is the student's local day; due dates are plain YYYY-MM-DD strings.
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const overdue = (tasks.data ?? [])
    .filter(task => !task.completed && task.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (!overdue.length) return null;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListTasksQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const run = async (task: Task, action: () => Promise<unknown>, done: string) => {
    setBusyId(task.id);
    try {
      await action();
      refresh();
      toast({ title: done, description: task.title });
    } catch {
      toast({ title: 'That did not save', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const markDone = (task: Task) => run(task, () => toggle.mutateAsync({ id: task.id, data: { completed: true } }), 'Marked done');
  const moveTo = (task: Task, day: Date, label: string) =>
    run(task, () => update.mutateAsync({ id: task.id, data: { dueDate: format(day, 'yyyy-MM-dd') } }), `Moved to ${label}`);

  return <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm sm:p-6" data-testid="card-overdue-tasks">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive"><AlertTriangle size={19} /></span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[.13em] text-destructive">Needs attention</p>
        <h2 className="cc-display mt-1 text-2xl font-semibold" data-testid="text-overdue-count">{overdue.length === 1 ? '1 overdue task' : `${overdue.length} overdue tasks`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{overdue.length === 1 ? 'Finish it, or give it a new day so it doesn\'t slip further.' : 'Finish them, or give them new days so they don\'t slip further.'}</p>
      </div>
    </div>
    <div className="mt-4 divide-y divide-destructive/15">
      {overdue.map(task => {
        const busy = busyId === task.id;
        return <div key={task.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid={`row-overdue-${task.id}`}>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm font-semibold">{task.title}</div>
            <div className="mt-1 text-xs text-muted-foreground"><CourseTag code={task.courseCode} color={task.courseColor} className="text-foreground" /> · {format(parseISO(task.dueDate), 'MMM d')} · <span className="font-semibold text-destructive">{overdueLabel(task.dueDate, now)}</span></div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => markDone(task)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60" data-testid={`button-overdue-done-${task.id}`}><Check size={14} /> Done</button>
            <button type="button" disabled={busy} onClick={() => moveTo(task, now, 'today')} className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60" data-testid={`button-overdue-today-${task.id}`}>Move to today</button>
            <button type="button" disabled={busy} onClick={() => moveTo(task, addDays(now, 1), 'tomorrow')} className="inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60" data-testid={`button-overdue-tomorrow-${task.id}`}>Tomorrow</button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
