import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { z } from 'zod';
import {
  AlertCircle, Check, ChevronRight, FileJson2, LoaderCircle, Trash2, Upload,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getListCoursesQueryKey, getListTasksQueryKey,
  useImportAgenda, useListCourses, useListTasks,
  type AgendaImportEntry, type AgendaImportInput, type Course, type Task,
} from '@workspace/api-client-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Enter a real calendar date');

const entrySchema = z.object({
  title: z.string().trim().min(1, 'Add a title').max(300, 'Titles must be 300 characters or fewer'),
  type: z.enum(['assignment', 'exam', 'project', 'reading', 'other']),
  dueDate: daySchema,
  dueTime: z.preprocess(value => value === '' ? null : value, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm').nullable().optional()),
  priority: z.enum(['low', 'medium', 'high']),
  notes: z.string().max(2000, 'Notes must be 2,000 characters or fewer').nullable().optional(),
});
const agendaSchema = z.object({
  course: z.object({
    code: z.string().trim().min(1, 'Course code is required').max(40),
    name: z.string().trim().min(1, 'Course name is required').max(140),
  }),
  tasks: z.array(entrySchema).min(1, 'Add at least one task').max(100, 'An agenda can contain up to 100 tasks'),
});
type EditableAgenda = z.infer<typeof agendaSchema>;

const typeNames: Record<AgendaImportEntry['type'], string> = {
  assignment: 'Assignment', exam: 'Exam', project: 'Project', reading: 'Reading', other: 'Other',
};
const normalize = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const humanError = (error: unknown) => error instanceof Error ? error.message : 'The import could not be completed. Your edits are still here.';

function importFileSchema(value: unknown) {
  return agendaSchema.safeParse(value);
}

export function AgendaImportButton() {
  const [open, setOpen] = useState(false);
  const [agenda, setAgenda] = useState<EditableAgenda | null>(null);
  const [fileName, setFileName] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [fileError, setFileError] = useState('');
  const [editError, setEditError] = useState('');
  const [result, setResult] = useState<{ insertedCount: number; skippedCount: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mutation = useImportAgenda({ mutation: { retry: false } });
  const coursesQuery = useListCourses();
  const tasksQuery = useListTasks({ status: 'all' });
  const queryClient = useQueryClient();
  const { user } = useUser();
  const courses = coursesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const matchingCourses = useMemo(() => agenda
    ? courses.filter(course => normalize(course.code) === normalize(agenda.course.code))
    : [], [agenda, courses]);
  const matchedCourse = matchingCourses.length === 1 ? matchingCourses[0] : null;
  const selectedCourse = matchingCourses.find(course => String(course.id) === selectedCourseId) ?? null;
  const targetCourse = matchingCourses.length === 1 ? matchedCourse : selectedCourse;
  const duplicates = useMemo(() => {
    if (!agenda) return new Set<number>();
    const existing = new Set(tasks
      .filter(task => targetCourse && task.courseId === targetCourse.id)
      .map(task => `${normalizeTitle(task.title)}|${task.dueDate}`));
    const duplicateRows = new Set<number>();
    agenda.tasks.forEach((task, index) => {
      const key = `${normalizeTitle(task.title)}|${task.dueDate}`;
      if (existing.has(key)) duplicateRows.add(index);
      existing.add(key);
    });
    return duplicateRows;
  }, [agenda, targetCourse, tasks]);
  const account = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? user?.fullName ?? 'Signed-in student';
  const pending = mutation.isPending;

  const reset = () => {
    setAgenda(null);
    setFileName('');
    setSelectedCourseId('');
    setFileError('');
    setEditError('');
    setResult(null);
    mutation.reset();
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) reset();
    setOpen(next);
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setFileError('');
    setEditError('');
    setResult(null);
    mutation.reset();
    if (file.size > 256 * 1024) {
      setFileError('This file is larger than 256 KB. Choose a smaller JSON agenda.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = importFileSchema(parsed);
      if (!validated.success) {
        const detail = validated.error.issues.slice(0, 3).map(issue => {
          const row = issue.path.includes('tasks') && typeof issue.path[1] === 'number' ? `Row ${issue.path[1] + 1}: ` : '';
          return `${row}${issue.message}`;
        }).join(' ');
        setFileError(detail || 'Check the JSON structure and try again.');
        return;
      }
      setAgenda(validated.data);
      setFileName(file.name);
      setSelectedCourseId('');
    } catch {
      setFileError('That file is not valid JSON. Check it and choose it again.');
    }
  };

  const updateCourse = (field: 'code' | 'name', value: string) => {
    if (!agenda) return;
    setAgenda({ ...agenda, course: { ...agenda.course, [field]: value } });
    if (field === 'code') setSelectedCourseId('');
    setEditError('');
  };
  const updateTask = (index: number, field: keyof AgendaImportEntry, value: string) => {
    if (!agenda) return;
    const tasksCopy = [...agenda.tasks];
    tasksCopy[index] = { ...tasksCopy[index], [field]: value } as AgendaImportEntry;
    setAgenda({ ...agenda, tasks: tasksCopy });
    setEditError('');
  };
  const removeTask = (index: number) => {
    if (!agenda) return;
    setAgenda({ ...agenda, tasks: agenda.tasks.filter((_, row) => row !== index) });
    setEditError('');
  };

  const confirmImport = () => {
    if (!agenda || pending || fileError || coursesQuery.isPending || tasksQuery.isPending ||
        coursesQuery.isError || tasksQuery.isError) return;
    const checked = agendaSchema.safeParse(agenda);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setEditError(`${issue.path.join('.').replace('tasks.', 'Task ')}: ${issue.message}`);
      return;
    }
    if (matchingCourses.length > 1 && !selectedCourse) {
      setEditError('Choose which matching course should receive these tasks.');
      return;
    }
    const input: AgendaImportInput = {
      course: {
        ...checked.data.course,
        ...(matchingCourses.length > 1 && selectedCourse ? { courseId: selectedCourse.id } : {}),
      },
      tasks: checked.data.tasks.map(task => ({
        ...task,
        dueTime: task.dueTime || null,
        notes: task.notes || null,
      })),
    };
    mutation.mutate({ data: input }, {
      onSuccess: response => {
        setResult({ insertedCount: response.insertedCount, skippedCount: response.skippedCount });
        void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      },
    });
  };

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/8 px-3.5 text-sm font-semibold text-primary hover:border-primary/60 hover:bg-primary/12 sm:px-4"
      data-testid="button-import-agenda"
    >
      <Upload size={16} /> <span>Import agenda</span>
    </button>
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      className="sr-only"
      aria-label="Choose an agenda JSON file"
      data-testid="input-agenda-file"
      disabled={pending}
      onChange={event => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; void readFile(file); }}
    />
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[900px] flex-col gap-0 overflow-hidden rounded-2xl border-card-border bg-background p-0 shadow-2xl sm:w-[calc(100vw-2rem)] ${pending ? '[&>button:first-of-type]:pointer-events-none [&>button:first-of-type]:opacity-40' : ''}`}>
        <DialogHeader className="shrink-0 border-b border-border bg-secondary/25 px-4 py-4 text-left sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.16em] text-primary">Bring your syllabus along</p>
              <DialogTitle className="cc-display text-2xl sm:text-3xl">Import an agenda</DialogTitle>
              <DialogDescription className="mt-2 max-w-xl leading-5">
                Choose a local JSON file, review every entry, then decide what belongs in your plan.
              </DialogDescription>
            </div>
            {agenda && !result ? <span className="mt-1 rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">{agenda.tasks.length} {agenda.tasks.length === 1 ? 'entry' : 'entries'}</span> : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-5">
          {!agenda && !result ? <div className="mx-auto max-w-xl py-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="group flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/60 px-5 text-center hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              data-testid="button-choose-agenda-file"
            >
              <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground transition-transform group-hover:-translate-y-0.5"><FileJson2 size={22} /></span>
              <span className="font-semibold">Choose a JSON file</span>
              <span className="mt-1 text-sm text-muted-foreground">Local file only · up to 256 KB · 1–100 tasks</span>
            </button>
            <div className="mt-4 rounded-xl border border-border/70 bg-card/60 p-4 text-sm leading-6 text-muted-foreground">
              <p className="font-semibold text-foreground">Expected structure</p>
              <code className="mt-2 block break-words rounded-lg bg-muted/70 p-3 font-mono text-[11px] leading-5">{'{ "course": { "code": "BIO 204", "name": "Cell Biology" }, "tasks": [{ "title": "Lab report", "type": "assignment", "dueDate": "2026-10-14", "dueTime": null, "priority": "medium", "notes": null }] }'}</code>
              <p className="mt-2">Nothing is saved until you confirm. The selected file is read in this browser and is not stored.</p>
            </div>
            {fileError ? <p className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="alert-agenda-file-error"><AlertCircle size={16} className="mt-0.5 shrink-0" />{fileError}</p> : null}
            {fileName ? <p className="mt-3 text-xs text-muted-foreground" data-testid="text-agenda-file-name">Selected: {fileName}</p> : null}
          </div> : null}

          {agenda && !result ? <fieldset disabled={pending} className="min-w-0 space-y-5">
            {(coursesQuery.isError || tasksQuery.isError) && <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
              Could not check your existing courses and tasks. Nothing has been saved.
              <button type="button" className="ml-2 underline" onClick={() => { void coursesQuery.refetch(); void tasksQuery.refetch(); }}>Try again</button>
            </div>}
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/70 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">Importing to signed-in account</p>
                <p className="mt-0.5 truncate text-sm font-semibold" data-testid="text-agenda-account">{account}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50" data-testid="button-change-agenda-file">
                <FileJson2 size={14} /> Change file
              </button>
            </div>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="agenda-course-title">
              <div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">01</span><h3 id="agenda-course-title" className="font-semibold">Course details</h3></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(120px,.7fr)_minmax(0,1.5fr)]">
                <label className="block text-xs font-semibold text-muted-foreground">Course code
                  <input value={agenda.course.code} onChange={event => updateCourse('code', event.target.value)} className="field mt-1.5" maxLength={40} data-testid="input-agenda-course-code" />
                </label>
                <label className="block text-xs font-semibold text-muted-foreground">Course name
                  <input value={agenda.course.name} onChange={event => updateCourse('name', event.target.value)} className="field mt-1.5" maxLength={140} data-testid="input-agenda-course-name" />
                </label>
              </div>
              {matchingCourses.length === 1 ? <p className="mt-3 flex items-center gap-1.5 text-xs text-[#23746a]" data-testid="text-agenda-course-match"><Check size={14} /> Matching course found: {matchedCourse?.code} · {matchedCourse?.name}. The importer will match by course code.</p> : null}
              {matchingCourses.length > 1 ? <label className="mt-3 block text-xs font-semibold text-muted-foreground">More than one course uses this code. Choose the destination.
                <select value={selectedCourseId} onChange={event => { setSelectedCourseId(event.target.value); setEditError(''); }} className="field mt-1.5" data-testid="select-agenda-course-match">
                  <option value="">Choose a course</option>
                  {matchingCourses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}
                </select>
              </label> : null}
              {matchingCourses.length === 0 ? <p className="mt-3 text-xs text-muted-foreground" data-testid="text-agenda-new-course">No matching course yet. The course shown in this file will be added with the import.</p> : null}
            </section>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-primary">Review each item</p><h3 className="cc-display text-xl font-semibold">Deadlines to bring over</h3></div>
              <p className="text-xs leading-5 text-muted-foreground" data-testid="text-agenda-review-warning">Notes are included. Long titles may be clipped in calendar previews; the full title stays saved.</p>
            </div>

            {agenda.tasks.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground" data-testid="empty-agenda-rows">All rows removed. Choose another file to continue.</div> : null}
            <div className="space-y-3">
              {agenda.tasks.map((task, index) => {
                const isDuplicate = duplicates.has(index);
                return <article key={index} className={`rounded-2xl border p-3.5 sm:p-4 ${isDuplicate ? 'border-[#c07b1f]/40 bg-[#c07b1f]/[.045]' : 'border-border bg-card'}`} data-testid={`row-agenda-task-${index}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                      <span className="truncate text-xs font-semibold text-muted-foreground">{task.title || 'Untitled task'}</span>
                      {isDuplicate ? <span className="shrink-0 rounded-full bg-[#c07b1f]/10 px-2 py-1 text-[10px] font-bold text-[#9a641b]" data-testid={`badge-agenda-duplicate-${index}`}>Possible duplicate</span> : null}
                    </div>
                    <button type="button" aria-label={`Remove task ${index + 1}`} onClick={() => removeTask(index)} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-remove-agenda-task-${index}`}><Trash2 size={15} /></button>
                  </div>
                  {isDuplicate ? <p className="mb-3 rounded-lg bg-[#c07b1f]/10 px-3 py-2 text-xs leading-5 text-[#805316]">Same course, title, and date as an existing task or an earlier row in this file. Matching entries will be skipped, not overwritten.</p> : null}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <label className="col-span-2 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground sm:col-span-2">Title
                      <input value={task.title} onChange={event => updateTask(index, 'title', event.target.value)} className="field mt-1 normal-case tracking-normal" maxLength={300} data-testid={`input-agenda-title-${index}`} />
                    </label>
                    <label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Due date
                      <input type="date" value={task.dueDate} onChange={event => updateTask(index, 'dueDate', event.target.value)} className="field mt-1 px-2 text-xs normal-case tracking-normal" data-testid={`input-agenda-date-${index}`} />
                    </label>
                    <label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Due time
                      <input type="time" value={task.dueTime ?? ''} onChange={event => updateTask(index, 'dueTime', event.target.value)} className="field mt-1 px-2 text-xs normal-case tracking-normal" data-testid={`input-agenda-time-${index}`} aria-describedby={`agenda-time-help-${index}`} />
                      {!task.dueTime ? <span id={`agenda-time-help-${index}`} className="mt-1 block text-[10px] font-medium normal-case tracking-normal text-muted-foreground">Unspecified</span> : null}
                    </label>
                    <label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Type
                      <select value={task.type} onChange={event => updateTask(index, 'type', event.target.value)} className="field mt-1 px-2 text-xs normal-case tracking-normal" data-testid={`select-agenda-type-${index}`}>
                        {Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">Priority
                      <select value={task.priority} onChange={event => updateTask(index, 'priority', event.target.value)} className="field mt-1 px-2 text-xs capitalize normal-case tracking-normal" data-testid={`select-agenda-priority-${index}`}>
                        {(['low', 'medium', 'high'] as const).map(value => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground sm:col-span-4">Notes <span className="font-normal normal-case tracking-normal">(optional)</span>
                      <textarea value={task.notes ?? ''} onChange={event => updateTask(index, 'notes', event.target.value)} rows={2} maxLength={2000} className="field mt-1 min-h-[60px] resize-y normal-case tracking-normal" placeholder="No notes" data-testid={`textarea-agenda-notes-${index}`} />
                    </label>
                  </div>
                </article>;
              })}
            </div>
            {fileError ? <p className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="alert-agenda-file-error"><AlertCircle size={16} className="mt-0.5 shrink-0" />{fileError}</p> : null}
            {editError ? <p className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="alert-agenda-validation">{editError}</p> : null}
            {mutation.isError ? <p className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="alert-agenda-import-error"><AlertCircle size={16} className="mt-0.5 shrink-0" />{humanError(mutation.error)} Your review is unchanged; you can retry.</p> : null}
          </fieldset> : null}

          {result ? <div className="mx-auto max-w-lg py-8 text-center" data-testid="panel-agenda-import-result">
            <span className={`mx-auto mb-4 grid size-14 place-items-center rounded-2xl ${result.insertedCount > 0 ? 'bg-[#e4f3f0] text-[#23746a]' : 'bg-secondary text-secondary-foreground'}`}>
              {result.insertedCount > 0 ? <Check size={26} /> : <FileJson2 size={25} />}
            </span>
            {result.insertedCount > 0 ? <>
              <h3 className="cc-display text-2xl font-semibold" data-testid="text-agenda-import-result-title">Agenda added to your plan</h3>
              <p className="mt-2 text-sm text-muted-foreground">Your course and task lists are refreshing now.</p>
            </> : <>
              <h3 className="cc-display text-2xl font-semibold" data-testid="text-agenda-import-result-title">Nothing new was added</h3>
              <p className="mt-2 text-sm text-muted-foreground">Every entry was already present or skipped by the importer.</p>
            </>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold text-primary" data-testid="text-agenda-inserted-count">{result.insertedCount}</p><p className="mt-1 text-xs text-muted-foreground">added</p></div>
              <div className="rounded-xl border border-border bg-card p-4"><p className="text-2xl font-bold text-muted-foreground" data-testid="text-agenda-skipped-count">{result.skippedCount}</p><p className="mt-1 text-xs text-muted-foreground">skipped</p></div>
            </div>
          </div> : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="hidden text-xs text-muted-foreground sm:block">{agenda && !result ? `${duplicates.size} possible ${duplicates.size === 1 ? 'duplicate' : 'duplicates'} · Nothing saved yet` : 'Your file stays on this device.'}</p>
          <div className="flex gap-2">
            {result ? <button type="button" onClick={() => handleOpenChange(false)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:flex-none" data-testid="button-close-agenda-result">Done</button> : <>
              {agenda ? <button type="button" disabled={pending} onClick={() => handleOpenChange(false)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 sm:flex-none" data-testid="button-cancel-agenda">Cancel</button> : <button type="button" onClick={() => handleOpenChange(false)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-muted sm:flex-none" data-testid="button-cancel-agenda">Cancel</button>}
              {agenda ? <button type="button" disabled={pending || !!fileError || coursesQuery.isPending || tasksQuery.isPending || coursesQuery.isError || tasksQuery.isError || agenda.tasks.length === 0 || (matchingCourses.length > 1 && !selectedCourse)} onClick={confirmImport} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:shadow-md disabled:pointer-events-none disabled:opacity-50 sm:flex-none" data-testid="button-confirm-agenda-import">
                {pending ? <><LoaderCircle size={16} className="animate-spin" /> Importing</> : <>Confirm import <ChevronRight size={16} /></>}
              </button> : null}
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}