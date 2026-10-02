import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { addDays, addMonths, subMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight,
  ChevronLeft, Clock3, Flame, LayoutDashboard, ListTodo, LogOut,
  Pencil, Plus, Search, Settings2, Sparkles, Trash2, UserRound, UsersRound,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetTaskQueryKey, getListCoursesQueryKey, getListTasksQueryKey,
  getGetPreferencesQueryKey, getGetProfileQueryKey,
  listCourses,
  useCreateCourse, useCreateTask, useDeleteCourse, useDeleteTask, useGetDashboard, useGetTask,
  useGetPreferences, useGetProfile,
  useListCourses, useListTasks, useToggleTaskCompletion, useUpdateCourse, useUpdateTask,
  useUpdatePreferences, useUpdateProfile,
  type Course, type Task, type TaskInput, type TaskType,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AgendaImportButton } from '@/components/agenda-import';
import { Toaster } from '@/components/ui/toaster';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getDaypartGreeting } from '@/lib/greeting';
import { normalizeTaskCourseCode, presetCourseValue, taskCourseChoices, taskCoursePresets } from '@/lib/task-course-choices';
import { StudyStudioPage } from '@/pages/study-studio';
import { CommunityPage } from '@/pages/community';
import { LandingPage } from '@/pages/landing';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;

const taskSchema = z.object({
  title: z.string().min(1, 'Give this task a name'),
  courseId: z.string().min(1, 'Pick a course'),
  type: z.enum(['assignment', 'exam', 'project', 'reading', 'other']),
  dueDate: z.string().min(1, 'Choose a due date'),
  dueTime: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  notes: z.string().optional(),
});
type TaskFormValues = z.infer<typeof taskSchema>;
const courseSchema = z.object({ name: z.string().min(1, 'Course name is required'), code: z.string().min(1, 'Course code is required'), color: z.string().min(1) });
type CourseFormValues = z.infer<typeof courseSchema>;
const profileSchema = z.object({
  displayName: z.string().min(1, 'Add your name'),
  major: z.string().min(1, 'Add your major or program'),
  year: z.string().min(1, 'Choose your year'),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const typeLabels: Record<string, string> = { assignment: 'Assignment', exam: 'Exam', project: 'Project', reading: 'Reading', other: 'Other' };
const typeColors: Record<string, string> = {
  assignment: 'bg-[#fff0d9] text-[#a25c13]', exam: 'bg-[#fce8e9] text-[#a73742]',
  project: 'bg-[#e4f3f0] text-[#23746a]', reading: 'bg-[#eaeafa] text-[#4e53a5]', other: 'bg-muted text-muted-foreground',
};
const priorityColors: Record<string, string> = { low: 'text-[#278476]', medium: 'text-[#c07b1f]', high: 'text-[#ba4146]' };

function Logo({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
    <span className={`grid size-9 place-items-center rounded-xl ${inverse ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>
      <BookOpen size={18} strokeWidth={2.7} />
    </span>
    <span className={`cc-display text-[19px] font-bold tracking-tight ${inverse ? 'text-sidebar-foreground' : 'text-foreground'}`}>Campus Connect</span>
  </Link>;
}

function AppButton({ children, variant = 'primary', className = '', ...props }: { children: ReactNode; variant?: 'primary' | 'quiet' | 'outline' | 'danger'; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md',
    quiet: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    outline: 'border border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary/5',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
  };
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em] ${className}`}>{children}</span>;
}

function TaskRow({ task, onToggle, onEdit, onDelete, compact = false }: { task: Task; onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void; compact?: boolean }) {
  return <div className={`group flex items-center gap-3 border-b border-border/70 py-3.5 last:border-0 ${task.completed ? 'opacity-55' : ''}`} data-testid={`row-task-${task.id}`}>
    <button type="button" onClick={() => onToggle(task)} aria-label={task.completed ? `Mark ${task.title} active` : `Complete ${task.title}`} className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all ${task.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary hover:bg-primary/10'}`} data-testid={`button-toggle-task-${task.id}`}>
      {task.completed ? <Check size={14} strokeWidth={3} /> : null}
    </button>
    <div className="min-w-0 flex-1">
      <div className={`truncate text-sm font-semibold ${task.completed ? 'line-through' : ''}`}>{task.title}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold" style={{ color: '#278476' }}>{task.courseCode}</span>
        <span className="size-1 rounded-full bg-border" />
        <span>{task.dueTime && !compact ? task.dueTime : format(parseISO(task.dueDate), 'MMM d')}</span>
      </div>
    </div>
    <Badge className={`${typeColors[task.type]} hidden sm:inline-flex`}>{typeLabels[task.type]}</Badge>
    <span className={`hidden text-[11px] font-bold capitalize sm:block ${priorityColors[task.priority]}`}>{task.priority}</span>
    <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
      <button type="button" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid={`button-edit-task-${task.id}`}><Pencil size={15} /></button>
      <button type="button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-task-${task.id}`}><Trash2 size={15} /></button>
    </div>
  </div>;
}

function TaskSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2" aria-label="Loading tasks" data-testid="loading-tasks">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-3 border-b border-border/60 py-4"><div className="size-6 animate-pulse rounded-full bg-muted" /><div className="flex-1 space-y-2"><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /><div className="h-2 w-1/4 animate-pulse rounded bg-muted" /></div></div>)}</div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center" data-testid="empty-state">
    <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Sparkles size={21} /></div>
    <h3 className="cc-display text-xl font-semibold">{title}</h3>
    <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>;
}

function TaskDialog({ open, onOpenChange, editingTask, courses, initialDate, includeCoursePresets = false }: { open: boolean; onOpenChange: (open: boolean) => void; editingTask: Task | null; courses: Course[]; initialDate?: string; includeCoursePresets?: boolean }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const fetched = useGetTask(editingTask?.id ?? 0, { query: { enabled: !!editingTask, queryKey: getGetTaskQueryKey(editingTask?.id ?? 0) } });
  const create = useCreateTask();
  const update = useUpdateTask();
  const createCourse = useCreateCourse();
  const initialized = useRef(false);
  const choices = includeCoursePresets && !editingTask
    ? taskCourseChoices(courses)
    : courses.map(course => ({ value: String(course.id), code: course.code, name: course.name }));
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', courseId: '', type: 'assignment', dueDate: initialDate ?? format(new Date(), 'yyyy-MM-dd'), dueTime: '', priority: 'medium', notes: '' },
  });
  useEffect(() => {
    if (!open) { initialized.current = false; return; }
    const task = fetched.data ?? editingTask;
    if (open && task) form.reset({ title: task.title, courseId: String(task.courseId), type: task.type, dueDate: task.dueDate, dueTime: task.dueTime ?? '', priority: task.priority, notes: task.notes ?? '' });
    if (!editingTask && !initialized.current) {
      const first = includeCoursePresets ? taskCourseChoices(courses)[0]?.value : courses[0] ? String(courses[0].id) : '';
      form.reset({ title: '', courseId: first ?? '', type: 'assignment', dueDate: initialDate ?? format(new Date(), 'yyyy-MM-dd'), dueTime: '', priority: 'medium', notes: '' });
    }
    initialized.current = true;
  }, [open, editingTask, fetched.data, courses, form, initialDate, includeCoursePresets]);
  const submit = async (values: TaskFormValues) => {
    try {
    let courseId = Number(values.courseId);
    const preset = includeCoursePresets && !editingTask
      ? taskCoursePresets.find(course => presetCourseValue(course.code) === values.courseId)
      : undefined;
    if (preset) {
      const latest = await listCourses();
      const existing = latest.find(course => normalizeTaskCourseCode(course.code) === normalizeTaskCourseCode(preset.code));
      const course = existing ?? await createCourse.mutateAsync({ data: { ...preset } });
      courseId = course.id;
      form.setValue('courseId', String(course.id));
      client.setQueryData(getListCoursesQueryKey(), existing ? latest : [...latest, course]);
      void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    }
    const data: TaskInput = { title: values.title, courseId, type: values.type as TaskType, dueDate: values.dueDate, dueTime: values.dueTime || null, priority: values.priority, notes: values.notes || null };
    const done = () => { client.invalidateQueries({ queryKey: getListTasksQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onOpenChange(false); toast({ title: editingTask ? 'Task updated' : 'Task added', description: 'Your study plan is up to date.' }); };
    if (editingTask) await update.mutateAsync({ id: editingTask.id, data });
    else await create.mutateAsync({ data });
    done();
    } catch (error) {
      toast({ title: 'Task was not saved', description: error instanceof Error ? error.message : 'Please try again. Your entries are still here.', variant: 'destructive' });
    }
  };
  const saving = form.formState.isSubmitting;
  return <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}><DialogContent className="rounded-2xl border-card-border bg-card p-0 sm:max-w-[520px]">
    <DialogHeader className="border-b border-border bg-secondary/35 px-6 py-5 text-left"><DialogTitle className="cc-display text-2xl">{editingTask ? 'Refine your task' : 'Add something to your plate'}</DialogTitle><DialogDescription>{editingTask ? 'Small updates keep your plan honest.' : 'Capture it now, then get back to your focus.'}</DialogDescription></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4 px-6 py-5">
      <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel>What needs doing?</FormLabel><FormControl><input autoFocus className="field" placeholder="e.g. Outline chapter three" {...field} data-testid="input-task-title" /></FormControl><FormMessage /></FormItem>} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="courseId" render={({ field }) => <FormItem><FormLabel>Course</FormLabel><FormControl><select className="field" {...field} disabled={saving} data-testid="select-task-course"><option value="">Select a course</option>{choices.map(course => <option key={course.value} value={course.value}>{course.code} · {course.name}</option>)}</select></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>Type</FormLabel><FormControl><select className="field" {...field} data-testid="select-task-type">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormControl></FormItem>} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="dueDate" render={({ field }) => <FormItem><FormLabel>Due date</FormLabel><FormControl><input type="date" className="field" {...field} data-testid="input-task-date" /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="dueTime" render={({ field }) => <FormItem><FormLabel>Time <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><input type="time" className="field" {...field} data-testid="input-task-time" /></FormControl></FormItem>} />
      </div>
      <FormField control={form.control} name="priority" render={({ field }) => <FormItem><FormLabel>Priority</FormLabel><FormControl><div className="grid grid-cols-3 gap-2">{(['low', 'medium', 'high'] as const).map(priority => <button type="button" key={priority} onClick={() => field.onChange(priority)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${field.value === priority ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`} data-testid={`button-priority-${priority}`}>{priority}</button>)}</div></FormControl></FormItem>} />
      <FormField control={form.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><textarea className="field min-h-20 resize-y" placeholder="Anything that will help future-you..." {...field} data-testid="textarea-task-notes" /></FormControl></FormItem>} />
      <DialogFooter className="gap-2 pt-2"><AppButton type="button" variant="quiet" disabled={saving} onClick={() => onOpenChange(false)} data-testid="button-cancel-task">Cancel</AppButton><AppButton type="submit" disabled={saving} data-testid="button-save-task">{saving ? 'Saving...' : editingTask ? 'Save changes' : 'Add task'}</AppButton></DialogFooter>
    </form></Form>
  </DialogContent></Dialog>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const nav = [
    { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
    { href: '/tasks', label: 'All tasks', icon: ListTodo },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/study-studio', label: 'Study', accessibleLabel: 'Flashcards & AI', icon: BookOpen },
    { href: '/community', label: 'Community', icon: UsersRound },
    { href: '/profile', label: 'Profile', icon: UserRound },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ];
  return <div className="cc-grain min-h-[100dvh] bg-background">
    <main className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
        <Logo />
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="hidden text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground sm:block">{format(new Date(), 'EEEE · MMM d')}</span>
          <div className="flex items-center gap-2" data-testid="text-header-student">
            <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{user?.firstName?.slice(0, 1) ?? 'S'}</span>
            <span className="text-sm font-semibold">{user?.firstName ?? 'Student'}</span>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1320px] px-5 pb-[calc(11rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-8 lg:pb-[calc(8rem+env(safe-area-inset-bottom))]">{children}</div>
    </main>
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-foreground/10 bg-sidebar/95 text-sidebar-foreground shadow-[0_-10px_30px_-20px_hsl(var(--foreground)/.45)] backdrop-blur-xl [padding-bottom:env(safe-area-inset-bottom)]">
      <nav aria-label="Main navigation" className="mx-auto grid max-w-[1320px] grid-cols-4 gap-1 px-2 py-2 sm:grid-cols-4 sm:px-6 lg:grid-cols-8 lg:gap-2">
        {nav.map(item => {
          const Icon = item.icon;
          const active = location === item.href || (item.href === '/dashboard' && location === '/');
          return <Link key={item.href} href={item.href} aria-label={item.accessibleLabel ?? item.label} aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight sm:text-xs ${active ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}
            data-testid={`link-nav-${item.href.slice(1)}`}>
            <Icon size={18} strokeWidth={active ? 2.5 : 2} />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>;
        })}
        <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} aria-label="Sign out"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-semibold leading-tight text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground sm:text-xs"
          data-testid="button-sign-out">
          <LogOut size={18} />
          <span className="max-w-full truncate">Sign out</span>
        </button>
      </nav>
      <div className="border-t border-sidebar-foreground/10 px-4 py-2 text-center">
        <a
          href="https://docs.google.com/forms/d/e/1FAIpQLSd9gYj6njHFB9V1_EN0djNRcLPjx865jcvqEP8M1owrl89r9Q/viewform?usp=header"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Feedback survey (opens in a new tab)"
          className="inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold text-sidebar-foreground/75 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          data-testid="link-feedback-survey"
        >
          Feedback survey <ArrowRight size={13} className="-rotate-45" />
        </a>
      </div>
    </footer>
  </div>;
}

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const client = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const courses = useListCourses();
  const toggle = useToggleTaskCompletion();
  const del = useDeleteTask();
  const { user } = useUser();
  const [greeting, setGreeting] = useState(() => getDaypartGreeting(new Date().getHours()));

  useEffect(() => {
    const refreshGreeting = () => setGreeting(getDaypartGreeting(new Date().getHours()));
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refreshGreeting();
    };
    const interval = window.setInterval(refreshGreeting, 60_000);
    window.addEventListener('focus', refreshGreeting);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshGreeting);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);
  
  const toggleTask = (task: Task) => toggle.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); } });
  const deleteTask = (task: Task) => { if (window.confirm(`Remove "${task.title}" from your plan?`)) del.mutate({ id: task.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); toast({ title: 'Task removed' }); } }); };
  const today = data?.todayTasks ?? [];
  const upcoming = data?.upcomingTasks ?? [];
  
  return <div className="cc-page space-y-8 pb-12">
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-semibold text-primary">A clear day starts here.</p><h1 className="cc-display text-4xl font-semibold leading-[.95] sm:text-5xl"><span data-testid="text-dashboard-greeting">{greeting}</span>, <span className="text-primary">{user?.firstName ?? 'student'}</span>.</h1><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">One thoughtful next step is enough. Here’s what deserves your attention today.</p></div><div className="flex flex-wrap gap-2"><AgendaImportButton /><AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-task-dashboard"><Plus size={17} /> Add task</AppButton></div></section>
    {isError ? <div className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>We couldn't load your study plan.</span><AppButton variant="outline" onClick={() => refetch()} data-testid="button-retry-dashboard">Try again</AppButton></div> : null}
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,.65fr)]">
      <div className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8"><div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Flame size={16} /> This week</div><h2 className="cc-display text-3xl font-semibold">Keep your rhythm.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-sidebar-foreground/60">Small, consistent wins are what move a semester forward.</p></div><div className="grid size-16 place-items-center rounded-full border-[6px] border-primary/25 border-t-primary text-lg font-bold text-primary">{data?.completion.percentage ?? 0}%</div></div><div className="mt-7 grid grid-cols-7 gap-2">{(data?.completion.days ?? []).slice(0, 7).map((day, i) => <div key={day.date} className="text-center"><div className="mx-auto mb-2 h-20 w-full max-w-8 rounded-full bg-sidebar-accent p-1"><div className="flex h-full items-end"><div className="w-full rounded-full bg-primary" style={{ height: `${day.total ? Math.max(10, (day.completed / day.total) * 100) : 8}%` }} /></div></div><span className="text-[10px] font-semibold uppercase text-sidebar-foreground/45">{format(parseISO(day.date), 'EEEEE')}</span></div>)}{!data?.completion.days?.length ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="text-center"><div className="mx-auto mb-2 h-20 w-full max-w-8 rounded-full bg-sidebar-accent" /><span className="text-[10px] text-sidebar-foreground/45">—</span></div>) : null}</div><div className="mt-5 flex items-center justify-between text-xs text-sidebar-foreground/55"><span>{data?.completion.completed ?? 0} completed</span><span>{data?.completion.total ?? 0} planned this week</span></div></div>
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex-1"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">A gentle nudge</p><h2 className="cc-display mt-2 text-2xl font-semibold">You’ve got this.</h2></div><span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><Check size={19} /></span></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Start with the task that takes less than 20 minutes. Momentum usually follows.</p><Link href="/tasks" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3" data-testid="link-view-plan">View your plan <ArrowRight size={16} /></Link></div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex-1 bg-gradient-to-br from-card to-secondary/10 border-secondary/30"><div className="flex items-start justify-between"><div><h2 className="cc-display mt-1 text-2xl font-semibold">Flashcards & AI</h2></div><span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><BookOpen size={19} /></span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Build your own flashcards, generate them from notes, and study your decks.</p><Link href="/study-studio" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-secondary-foreground hover:gap-3" data-testid="link-open-studio">Study with flashcards <ArrowRight size={16} /></Link></div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex-1 bg-gradient-to-br from-card to-[#23746a]/10 border-[#23746a]/30"><div className="flex items-start justify-between"><div><h2 className="cc-display mt-1 text-2xl font-semibold">Community</h2></div><span className="grid size-10 place-items-center rounded-xl bg-[#23746a] text-primary-foreground"><UsersRound size={19} /></span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">Connect with peers, tutors, and advisors.</p><Link href="/community" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#23746a] hover:gap-3" data-testid="link-open-community">Join conversation <ArrowRight size={16} /></Link></div>
      </div>
    </section>
    <section className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Today</p><h2 className="cc-display mt-1 text-2xl font-semibold">{isToday(new Date()) ? 'Your focus list' : 'Your tasks'}</h2></div><Link href="/tasks" className="text-xs font-bold text-primary hover:underline" data-testid="link-all-tasks">See all</Link></div>{isLoading ? <TaskSkeleton /> : today.length ? <div>{today.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} />)}</div> : <EmptyState title="A blank page, for now." description="Nothing is due today. Use the breathing room to get ahead." action={<AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-first-task"><Plus size={16} /> Add a task</AppButton>} />}</div>
      <div><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Coming up</p><h2 className="cc-display mt-1 text-2xl font-semibold">Next deadlines</h2></div><Link href="/calendar" className="text-xs font-bold text-primary hover:underline" data-testid="link-calendar">Open calendar</Link></div><div className="rounded-2xl border border-border bg-card p-5 shadow-sm">{isLoading ? <TaskSkeleton rows={3} /> : upcoming.length ? upcoming.slice(0, 4).map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} compact />) : <EmptyState title="No deadlines ahead" description="Your future self is feeling very organized." />}</div></div>
    </section>
    <TaskDialog open={dialog.open} onOpenChange={open => setDialog({ ...dialog, open })} editingTask={dialog.task} courses={courses.data ?? []} />
  </div>;
}

function TasksPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [type, setType] = useState('all');
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const client = useQueryClient();
  const { toast } = useToast();
  const tasks = useListTasks({ status: status === 'all' ? 'all' : status, type: type === 'all' ? undefined : type as never });
  const courses = useListCourses();
  const toggle = useToggleTaskCompletion();
  const del = useDeleteTask();
  const filtered = useMemo(() => (tasks.data ?? []).filter(task => `${task.title} ${task.courseName} ${task.courseCode}`.toLowerCase().includes(search.toLowerCase())), [tasks.data, search]);
  const toggleTask = (task: Task) => toggle.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListTasksQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
  const deleteTask = (task: Task) => { if (window.confirm(`Remove "${task.title}" from your plan?`)) del.mutate({ id: task.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListTasksQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); toast({ title: 'Task removed' }); } }); };
  return <div className="cc-page space-y-7"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">The full picture</p><h1 className="cc-display mt-1 text-4xl font-semibold">All tasks</h1><p className="mt-2 text-sm text-muted-foreground">Keep every assignment, exam, and idea in view.</p></div><div className="flex flex-wrap gap-2"><AgendaImportButton /><AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-task"><Plus size={17} /> Add task</AppButton></div></section>
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or courses..." data-testid="input-search-tasks" /></div><div className="flex gap-2 overflow-x-auto"><select className="field min-w-[118px]" value={status} onChange={e => setStatus(e.target.value as typeof status)} data-testid="select-task-status"><option value="all">All tasks</option><option value="active">Active</option><option value="completed">Completed</option></select><select className="field min-w-[124px]" value={type} onChange={e => setType(e.target.value)} data-testid="select-task-filter-type"><option value="all">Every type</option>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div></div>
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">{tasks.isLoading ? <TaskSkeleton rows={7} /> : tasks.isError ? <EmptyState title="Couldn't load tasks" description="There was a hiccup bringing in your list." action={<AppButton variant="outline" onClick={() => tasks.refetch()} data-testid="button-retry-tasks">Try again</AppButton>} /> : filtered.length ? <div>{filtered.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} />)}</div> : <EmptyState title={search ? 'No matches here.' : 'Your list is clear.'} description={search ? 'Try another phrase or clear the search.' : 'Add the next thing you want to make progress on.'} action={!search ? <AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-empty-task"><Plus size={16} /> Add a task</AppButton> : null} />}</div>
    <TaskDialog open={dialog.open} onOpenChange={open => setDialog({ ...dialog, open })} editingTask={dialog.task} courses={courses.data ?? []} includeCoursePresets />
  </div>;
}

function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null; date?: string }>({ open: false, task: null });
  
  const tasks = useListTasks();
  const courses = useListCourses();
  
  const client = useQueryClient();
  const { toast } = useToast();
  const toggle = useToggleTaskCompletion();
  const del = useDeleteTask();

  const toggleTask = (task: Task) => toggle.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); } });
  const deleteTask = (task: Task) => { if (window.confirm(`Remove "${task.title}" from your plan?`)) del.mutate({ id: task.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); toast({ title: 'Task removed' }); } }); };

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const byDay = (day: Date) => (tasks.data ?? []).filter(task => isSameDay(parseISO(task.dueDate), day));
  const selectedDayTasks = byDay(selectedDay);
  
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  
  const upcomingTasks = (tasks.data ?? [])
    .filter(task => !task.completed && parseISO(task.dueDate) > endOfToday)
    .sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime())
    .slice(0, 4);

  return <div className="cc-page space-y-7 pb-12">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-semibold text-primary">Make space for what matters</p>
        <h1 className="cc-display mt-1 text-4xl font-semibold">Calendar</h1>
        <p className="mt-2 text-sm text-muted-foreground">The big picture of your semester.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AppButton variant="outline" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()); }} data-testid="button-calendar-today">Today</AppButton>
        <AgendaImportButton />
        <AppButton onClick={() => setDialog({ open: true, task: null, date: format(selectedDay, 'yyyy-MM-dd') })} data-testid="button-add-task-calendar"><Plus size={17} /> Add task</AppButton>
      </div>
    </section>

    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_450px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
          <button className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setCursor(subMonths(cursor, 1))} data-testid="button-calendar-prev-month"><ChevronLeft size={20} /></button>
          <h2 className="cc-display text-2xl font-semibold tracking-tight">{format(cursor, 'MMMM yyyy')}</h2>
          <button className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setCursor(addMonths(cursor, 1))} data-testid="button-calendar-next-month"><ChevronRight size={20} /></button>
        </div>
        
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {calendarDays.map(day => {
              const dayTasks = byDay(day);
              const isSelected = isSameDay(day, selectedDay);
              const isCurrentMonth = isSameMonth(day, cursor);
              const isTodayDate = isToday(day);
              return <button 
                key={day.toISOString()} 
                onClick={() => { setSelectedDay(day); if (!isCurrentMonth) setCursor(day); }}
                aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}, ${dayTasks.length} ${dayTasks.length === 1 ? 'task' : 'tasks'}`}
                aria-pressed={isSelected}
                className={`relative flex min-h-12 flex-col items-center justify-start overflow-hidden rounded-xl border p-1.5 transition-all sm:h-24 sm:items-start sm:p-2.5 ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : isTodayDate ? 'border-primary/40 bg-primary/5 hover:border-primary/60' : 'border-border/50 bg-card hover:border-border hover:bg-muted/50'} ${!isCurrentMonth && !isSelected ? 'opacity-40' : ''}`}
                data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              >
                <div className="flex w-full items-center justify-center sm:justify-between">
                  <span className={`text-sm font-semibold sm:text-base ${isSelected || isTodayDate ? 'text-primary' : 'text-foreground'}`}>{format(day, 'd')}</span>
                  {dayTasks.length > 0 ? <span className="hidden text-[10px] font-bold text-muted-foreground sm:block">{dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}</span> : null}
                </div>
                
                {/* Mobile indicators */}
                <div className="mt-1 flex flex-wrap justify-center gap-1 sm:hidden">
                  {dayTasks.slice(0, 3).map((t, i) => <div key={i} className={`size-1.5 rounded-full bg-current ${typeColors[t.type].split(' ')[1]}`} />)}
                  {dayTasks.length > 3 ? <div className="size-1.5 rounded-full bg-muted-foreground" /> : null}
                </div>
                
                {/* Desktop task list */}
                <div className="mt-2 hidden w-full flex-col gap-1 sm:flex">
                  {dayTasks.slice(0, 2).map((t) => (
                    <div key={t.id} className={`w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${typeColors[t.type]} ${t.completed ? 'opacity-50 line-through' : ''}`}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 ? <div className="pl-1 text-[10px] font-semibold text-muted-foreground">+{dayTasks.length - 2} more</div> : null}
                </div>
              </button>;
            })}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="cc-display text-2xl font-semibold">
                {isToday(selectedDay) ? 'Today’s Agenda' : format(selectedDay, 'EEEE, MMM d')}
              </h3>
            </div>
            <AppButton variant="outline" aria-label={`Add task for ${format(selectedDay, 'MMMM d')}`} onClick={() => setDialog({ open: true, task: null, date: format(selectedDay, 'yyyy-MM-dd') })} data-testid="button-add-task-agenda"><Plus size={16} /></AppButton>
          </div>
          
          <div className="space-y-1">
            {tasks.isLoading ? <TaskSkeleton rows={3} /> : tasks.isError ? (
              <div className="py-6 text-sm text-destructive" role="alert">Could not load your calendar. <button type="button" className="font-bold underline" onClick={() => tasks.refetch()}>Try again</button></div>
            ) : selectedDayTasks.length > 0 ? (
              selectedDayTasks.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} />)
            ) : (
              <EmptyState 
                title="Clear schedule" 
                description="No tasks due on this date." 
                action={<AppButton onClick={() => setDialog({ open: true, task: null, date: format(selectedDay, 'yyyy-MM-dd') })}><Plus size={16} /> Add a task</AppButton>}
              />
            )}
          </div>
        </div>

        {upcomingTasks.length > 0 && (
          <div className="rounded-2xl border border-border bg-sidebar p-5 text-sidebar-foreground shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Flame size={18} className="text-primary" />
              <h3 className="cc-display text-xl font-semibold">Upcoming deadlines</h3>
            </div>
            <div className="space-y-4">
              {upcomingTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 border-b border-sidebar-border/50 pb-4 last:border-0 last:pb-0">
                  <button type="button" onClick={() => toggleTask(task)} aria-label={`Complete ${task.title}`} className="group mt-2 grid size-7 shrink-0 place-items-center rounded-full border border-sidebar-foreground/40 hover:border-primary hover:bg-primary/20" data-testid={`button-upcoming-complete-${task.id}`}><Check size={14} className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" /></button>
                  <div className="mt-0.5 flex flex-col items-center justify-center rounded-lg bg-sidebar-accent px-2 py-1 text-center">
                    <span className="text-[10px] font-bold uppercase text-sidebar-foreground/60">{format(parseISO(task.dueDate), 'MMM')}</span>
                    <span className="text-sm font-semibold">{format(parseISO(task.dueDate), 'd')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{task.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-sidebar-foreground/70">
                      <span className="font-bold text-sidebar-primary">{task.courseCode}</span>
                      <span>•</span>
                      <span>{typeLabels[task.type]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/study-studio" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"><BookOpen size={16} /> Study with flashcards <ArrowRight size={15} /></Link>
          </div>
        )}
      </div>
    </div>
    <TaskDialog open={dialog.open} onOpenChange={open => setDialog(prev => ({ ...prev, open }))} editingTask={dialog.task} courses={courses.data ?? []} initialDate={dialog.date} />
  </div>;
}

function CourseManager({ courses }: { courses: Course[] }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const create = useCreateCourse(); const update = useUpdateCourse(); const del = useDeleteCourse();
  const [editing, setEditing] = useState<Course | null>(null); const [open, setOpen] = useState(false);
  const form = useForm<CourseFormValues>({ resolver: zodResolver(courseSchema), defaultValues: { name: '', code: '', color: '#F4A43A' } });
  const start = (course?: Course) => { setEditing(course ?? null); form.reset(course ? { name: course.name, code: course.code, color: course.color } : { name: '', code: '', color: '#F4A43A' }); setOpen(true); };
  const submit = (values: CourseFormValues) => { const done = () => { client.invalidateQueries({ queryKey: getListCoursesQueryKey() }); setOpen(false); toast({ title: editing ? 'Course updated' : 'Course added' }); }; editing ? update.mutate({ id: editing.id, data: values }, { onSuccess: done }) : create.mutate({ data: values }, { onSuccess: done }); };
  return <><div className="space-y-3">{courses.map(course => <div key={course.id} className="flex items-center gap-3 rounded-xl border border-border p-3" data-testid={`row-course-${course.id}`}><span className="size-3 rounded-full" style={{ backgroundColor: course.color }} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{course.name}</div><div className="text-xs text-muted-foreground">{course.code}</div></div><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => start(course)} aria-label={`Edit ${course.name}`} data-testid={`button-edit-course-${course.id}`}><Pencil size={15} /></button><button className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (window.confirm(`Delete ${course.name}?`)) del.mutate({ id: course.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListCoursesQueryKey() }); toast({ title: 'Course removed' }); } }); }} aria-label={`Delete ${course.name}`} data-testid={`button-delete-course-${course.id}`}><Trash2 size={15} /></button></div>)}<AppButton variant="outline" className="w-full" onClick={() => start()} data-testid="button-add-course"><Plus size={16} /> Add course</AppButton></div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="rounded-2xl bg-card sm:max-w-[430px]"><DialogHeader className="text-left"><DialogTitle className="cc-display text-2xl">{editing ? 'Edit course' : 'Add a course'}</DialogTitle><DialogDescription>Keep your plan connected to the classes you care about.</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4"><FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Course name</FormLabel><FormControl><input className="field" placeholder="Cognitive Psychology" {...field} data-testid="input-course-name" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel>Course code</FormLabel><FormControl><input className="field" placeholder="PSYC 204" {...field} data-testid="input-course-code" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="color" render={({ field }) => <FormItem><FormLabel>Course color</FormLabel><FormControl><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-border bg-card p-1" {...field} data-testid="input-course-color" /></FormControl></FormItem>} /><DialogFooter><AppButton type="button" variant="quiet" onClick={() => setOpen(false)} data-testid="button-cancel-course">Cancel</AppButton><AppButton type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-course">Save course</AppButton></DialogFooter></form></Form></DialogContent></Dialog></>;
}

function ProfilePage() {
  const { user } = useUser();
  const courses = useListCourses();
  const profile = useGetProfile();
  const update = useUpdateProfile();
  const { toast } = useToast();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema), defaultValues: { displayName: '', major: '', year: '' } });
  useEffect(() => {
    if (profile.data) form.reset(profile.data);
  }, [profile.data, form]);
  const submit = (values: ProfileFormValues) => update.mutate({ data: values }, {
    onSuccess: () => {
      setSaved(true);
      client.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      toast({ title: 'Profile saved', description: 'Your student details are stored and ready for alpha review.' });
    },
  });
  return <div className="cc-page space-y-7"><section><p className="text-sm font-semibold text-primary">Your campus, your pace</p><h1 className="cc-display mt-1 text-4xl font-semibold">Profile</h1><p className="mt-2 text-sm text-muted-foreground">Save a few details so Campus Connect feels like yours.</p></section><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl bg-sidebar p-7 text-sidebar-foreground shadow-lg"><div className="grid size-20 place-items-center rounded-3xl bg-primary text-3xl font-bold text-primary-foreground">{user?.firstName?.slice(0, 1) ?? 'S'}</div><h2 className="cc-display mt-6 text-3xl font-semibold">{profile.data?.displayName || user?.fullName || 'Your profile'}</h2><p className="mt-1 text-sm text-sidebar-foreground/60">{user?.primaryEmailAddress?.emailAddress ?? 'Your account email'}</p>{profile.data?.major || profile.data?.year ? <div className="mt-5 flex flex-wrap gap-2">{profile.data.major ? <span className="rounded-full bg-sidebar-accent px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/80">{profile.data.major}</span> : null}{profile.data.year ? <span className="rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">{profile.data.year}</span> : null}</div> : null}<div className="mt-8 border-t border-sidebar-border pt-5"><div className="flex items-center justify-between text-sm"><span className="text-sidebar-foreground/55">Member since</span><span className="font-semibold">{user?.createdAt ? format(new Date(user.createdAt), 'MMM yyyy') : 'This year'}</span></div>{saved ? <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary" data-testid="text-profile-saved"><span className="grid size-5 place-items-center rounded-full bg-primary/15"><Check size={12} /></span>Saved to your account</div> : null}</div></div><div className="space-y-5"><div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Student details</p><h2 className="cc-display mt-1 text-2xl font-semibold">Make it yours</h2><p className="mt-2 text-sm text-muted-foreground">This information is saved to your profile and shown again when you return.</p></div><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4"><FormField control={form.control} name="displayName" render={({ field }) => <FormItem><FormLabel>Name</FormLabel><FormControl><input className="field" placeholder="Jordan Lee" {...field} data-testid="input-profile-name" /></FormControl><FormMessage /></FormItem>} /><div className="grid gap-4 sm:grid-cols-2"><FormField control={form.control} name="major" render={({ field }) => <FormItem><FormLabel>Major or program</FormLabel><FormControl><input className="field" placeholder="Interaction Design" {...field} data-testid="input-profile-major" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="year" render={({ field }) => <FormItem><FormLabel>Year</FormLabel><FormControl><select className="field" {...field} data-testid="select-profile-year"><option value="">Choose year</option><option>First year</option><option>Second year</option><option>Third year</option><option>Fourth year</option><option>Graduate</option></select></FormControl><FormMessage /></FormItem>} /></div><div className="flex justify-end pt-2"><AppButton type="submit" disabled={update.isPending} data-testid="button-save-profile">{update.isPending ? 'Saving...' : 'Save profile'}</AppButton></div></form></Form></div><div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Your courses</p><h2 className="cc-display mt-1 text-2xl font-semibold">This semester</h2></div><BookOpen className="text-primary" size={22} /></div>{courses.isLoading ? <TaskSkeleton rows={3} /> : courses.data?.length ? <CourseManager courses={courses.data} /> : <EmptyState title="Add your first course" description="Courses help your tasks become a plan, not just a list." action={<CourseManager courses={[]} />} />}</div></div></div></div>;
}

function SettingsPage() {
  const preferences = useGetPreferences();
  const update = useUpdatePreferences();
  const client = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({ dailyFocus: true, deadlineReminders: true, weeklyReflection: false });
  useEffect(() => {
    if (preferences.data) setSettings(preferences.data);
  }, [preferences.data]);
  const change = (key: keyof typeof settings) => { setSettings(s => ({ ...s, [key]: !s[key] })); setSaved(false); };
  const save = () => update.mutate({ data: settings }, {
    onSuccess: () => {
      setSaved(true);
      client.invalidateQueries({ queryKey: getGetPreferencesQueryKey() });
      toast({ title: 'Preferences saved', description: 'Your reminder choices are stored for next time.' });
    },
  });
  return <div className="cc-page max-w-3xl space-y-7"><section><p className="text-sm font-semibold text-primary">Make it work for you</p><h1 className="cc-display mt-1 text-4xl font-semibold">Settings</h1><p className="mt-2 text-sm text-muted-foreground">Choose when Campus Connect checks in. These preferences persist with your account.</p></section><div className="rounded-2xl border border-border bg-card shadow-sm"><div className="border-b border-border p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Reminders</p><h2 className="cc-display mt-1 text-2xl font-semibold">Thoughtful, not noisy</h2></div><div className="divide-y divide-border">{([{ key: 'dailyFocus', title: 'Daily focus note', desc: 'A short morning view of what deserves your attention.' }, { key: 'deadlineReminders', title: 'Deadline reminders', desc: 'A gentle heads-up the day before something is due.' }, { key: 'weeklyReflection', title: 'Weekly reflection', desc: 'A Sunday look back at the progress you made.' }] as const).map(item => <button type="button" key={item.key} className="flex w-full items-center gap-4 p-6 text-left hover:bg-muted/40 sm:p-7" onClick={() => change(item.key)} data-testid={`button-setting-${item.key}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${settings[item.key] ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{settings[item.key] ? <Check size={18} /> : <Bell size={18} />}</span><span className="flex-1"><span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.desc}</span></span><span className={`relative h-6 w-11 rounded-full ${settings[item.key] ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-1 size-4 rounded-full bg-card shadow-sm ${settings[item.key] ? 'left-6' : 'left-1'}`} /></span></button>)}</div><div className="flex items-center justify-between bg-secondary/25 p-5 sm:p-6"><span className="text-sm text-muted-foreground">{saved ? 'Your preferences are saved.' : 'Changes are saved when you tap save.'}</span><AppButton onClick={save} disabled={update.isPending || preferences.isLoading} data-testid="button-save-settings">{update.isPending ? 'Saving...' : 'Save preferences'}</AppButton></div></div></div>;
}


function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <div className="cc-grain flex min-h-[100dvh] items-center justify-center bg-secondary/35 px-4 py-8"><div className="w-full max-w-[440px]"><div className="mb-6 text-center"><Logo /></div>{mode === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></div>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function Router() {
  return <Switch><Route path="/" component={LandingPage} /><Route path="/sign-in/*?" component={() => <AuthPage mode="sign-in" />} /><Route path="/sign-up/*?" component={() => <AuthPage mode="sign-up" />} /><Route path="/dashboard" component={() => <Protected><AppShell><DashboardPage /></AppShell></Protected>} /><Route path="/tasks" component={() => <Protected><AppShell><TasksPage /></AppShell></Protected>} /><Route path="/calendar" component={() => <Protected><AppShell><CalendarPage /></AppShell></Protected>} /><Route path="/study-studio" component={() => <Protected><AppShell><StudyStudioPage /></AppShell></Protected>} /><Route path="/community" component={() => <Protected><AppShell><CommunityPage /></AppShell></Protected>} /><Route path="/profile" component={() => <Protected><AppShell><ProfilePage /></AppShell></Protected>} /><Route path="/settings" component={() => <Protected><AppShell><SettingsPage /></AppShell></Protected>} /><Route component={() => <div className="p-10">Page not found. <Link href="/">Go home</Link></div>} /></Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#F4A43A', colorForeground: '#202338', colorMutedForeground: '#6F7180', colorBackground: '#FEFCF7', colorInput: '#FAF7F0', colorInputForeground: '#202338', colorDanger: '#B8444B', colorNeutral: '#E4DFD5', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.85rem' },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#FEFCF7] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#202338]',
    headerSubtitle: 'text-[#6F7180]',
    socialButtonsBlockButtonText: 'text-[#202338]',
    formFieldLabel: 'text-[#202338]',
    footerActionLink: 'text-[#A9620D]',
    footerActionText: 'text-[#6F7180]',
    dividerText: 'text-[#6F7180]',
    identityPreviewEditButton: 'text-[#A9620D]',
    formFieldSuccessText: 'text-[#23746A]',
    alertText: 'text-[#202338]',
    logoBox: 'rounded-xl',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border-[#E4DFD5] bg-[#FAF7F0]',
    formButtonPrimary: 'bg-[#F4A43A] text-[#202338] hover:bg-[#E9932F]',
    formFieldInput: 'border-[#E4DFD5] bg-[#FAF7F0] text-[#202338]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#E4DFD5]',
    alert: 'border-[#E4DFD5] bg-[#FAF7F0]',
    otpCodeFieldInput: 'border-[#E4DFD5] bg-[#FAF7F0] text-[#202338]',
    formFieldRow: 'text-[#202338]',
    main: 'bg-transparent',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      client.clear();
    }
    previousUserId.current = userId;
  }), [addListener, client]);
  return null;
}

function App() {
  const push = (to: string, replace = false) => {
    const next = stripBase(to);
    if (replace) window.history.replaceState({}, '', next);
    else window.history.pushState({}, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Your next clear step is waiting.' } }, signUp: { start: { title: 'Make space to learn', subtitle: 'A calmer semester starts here.' } } }} routerPush={to => push(to)} routerReplace={to => push(to, true)}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><WouterRouter base={basePath}><RoutedErrorBoundary><Router /></RoutedErrorBoundary></WouterRouter><Toaster /></QueryClientProvider></ClerkProvider>;
}

export default App;