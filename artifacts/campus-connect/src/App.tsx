import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { addDays, format, isSameDay, isToday, parseISO, startOfWeek } from 'date-fns';
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight,
  Clock3, Flame, LayoutDashboard, ListTodo, LogOut, Menu,
  Pencil, Plus, Search, Settings2, Sparkles, Trash2, UserRound, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetTaskQueryKey, getListCoursesQueryKey, getListTasksQueryKey,
  getGetPreferencesQueryKey, getGetProfileQueryKey,
  useCreateCourse, useCreateTask, useDeleteCourse, useDeleteTask, useGetDashboard, useGetTask,
  useGetPreferences, useGetProfile,
  useListCourses, useListTasks, useToggleTaskCompletion, useUpdateCourse, useUpdateTask,
  useUpdatePreferences, useUpdateProfile,
  type Course, type Task, type TaskInput, type TaskType,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import './index.css';

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
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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

function TaskDialog({ open, onOpenChange, editingTask, courses }: { open: boolean; onOpenChange: (open: boolean) => void; editingTask: Task | null; courses: Course[] }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const fetched = useGetTask(editingTask?.id ?? 0, { query: { enabled: !!editingTask, queryKey: getGetTaskQueryKey(editingTask?.id ?? 0) } });
  const create = useCreateTask();
  const update = useUpdateTask();
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', courseId: '', type: 'assignment', dueDate: format(new Date(), 'yyyy-MM-dd'), dueTime: '', priority: 'medium', notes: '' },
  });
  useEffect(() => {
    const task = fetched.data ?? editingTask;
    if (open && task) form.reset({ title: task.title, courseId: String(task.courseId), type: task.type, dueDate: task.dueDate, dueTime: task.dueTime ?? '', priority: task.priority, notes: task.notes ?? '' });
    if (open && !editingTask) form.reset({ title: '', courseId: courses[0] ? String(courses[0].id) : '', type: 'assignment', dueDate: format(new Date(), 'yyyy-MM-dd'), dueTime: '', priority: 'medium', notes: '' });
  }, [open, editingTask, fetched.data, courses, form]);
  const submit = (values: TaskFormValues) => {
    const data: TaskInput = { title: values.title, courseId: Number(values.courseId), type: values.type as TaskType, dueDate: values.dueDate, dueTime: values.dueTime || null, priority: values.priority, notes: values.notes || null };
    const done = () => { client.invalidateQueries({ queryKey: getListTasksQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); onOpenChange(false); toast({ title: editingTask ? 'Task updated' : 'Task added', description: 'Your study plan is up to date.' }); };
    if (editingTask) update.mutate({ id: editingTask.id, data }, { onSuccess: done });
    else create.mutate({ data }, { onSuccess: done });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl border-card-border bg-card p-0 sm:max-w-[520px]">
    <DialogHeader className="border-b border-border bg-secondary/35 px-6 py-5 text-left"><DialogTitle className="cc-display text-2xl">{editingTask ? 'Refine your task' : 'Add something to your plate'}</DialogTitle><DialogDescription>{editingTask ? 'Small updates keep your plan honest.' : 'Capture it now, then get back to your focus.'}</DialogDescription></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-4 px-6 py-5">
      <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel>What needs doing?</FormLabel><FormControl><input autoFocus className="field" placeholder="e.g. Outline chapter three" {...field} data-testid="input-task-title" /></FormControl><FormMessage /></FormItem>} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="courseId" render={({ field }) => <FormItem><FormLabel>Course</FormLabel><FormControl><select className="field" {...field} data-testid="select-task-course"><option value="">Select a course</option>{courses.map(course => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>Type</FormLabel><FormControl><select className="field" {...field} data-testid="select-task-type">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormControl></FormItem>} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={form.control} name="dueDate" render={({ field }) => <FormItem><FormLabel>Due date</FormLabel><FormControl><input type="date" className="field" {...field} data-testid="input-task-date" /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="dueTime" render={({ field }) => <FormItem><FormLabel>Time <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><input type="time" className="field" {...field} data-testid="input-task-time" /></FormControl></FormItem>} />
      </div>
      <FormField control={form.control} name="priority" render={({ field }) => <FormItem><FormLabel>Priority</FormLabel><FormControl><div className="grid grid-cols-3 gap-2">{(['low', 'medium', 'high'] as const).map(priority => <button type="button" key={priority} onClick={() => field.onChange(priority)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${field.value === priority ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`} data-testid={`button-priority-${priority}`}>{priority}</button>)}</div></FormControl></FormItem>} />
      <FormField control={form.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes <span className="font-normal text-muted-foreground">(optional)</span></FormLabel><FormControl><textarea className="field min-h-20 resize-y" placeholder="Anything that will help future-you..." {...field} data-testid="textarea-task-notes" /></FormControl></FormItem>} />
      <DialogFooter className="gap-2 pt-2"><AppButton type="button" variant="quiet" onClick={() => onOpenChange(false)} data-testid="button-cancel-task">Cancel</AppButton><AppButton type="submit" disabled={create.isPending || update.isPending} data-testid="button-save-task">{create.isPending || update.isPending ? 'Saving...' : editingTask ? 'Save changes' : 'Add task'}</AppButton></DialogFooter>
    </form></Form>
  </DialogContent></Dialog>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useUser();
  const { signOut } = useClerk();
  const nav = [
    { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
    { href: '/tasks', label: 'All tasks', icon: ListTodo },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  ];
  return <div className="cc-grain min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-12 flex items-center justify-between"><Logo inverse /><button type="button" className="rounded-lg p-2 text-sidebar-foreground/60 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-sidebar-foreground/40">Your workspace</div>
      <nav className="space-y-1">{nav.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === item.href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}><Icon size={18} /><span>{item.label}</span>{location === item.href ? <ChevronRight size={15} className="ml-auto" /> : null}</Link>; })}</nav>
      <div className="mt-auto space-y-1"><Link href="/profile" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === '/profile' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-nav-profile"><UserRound size={18} />Profile</Link><Link href="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground" data-testid="link-nav-settings"><Settings2 size={18} />Settings</Link><button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground" data-testid="button-sign-out"><LogOut size={18} />Sign out</button></div>
    </aside>
    {mobileOpen ? <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-sidebar/30 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-menu-backdrop" /> : null}
    <main className="min-h-[100dvh] md:pl-[248px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8"><button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted md:hidden" data-testid="button-open-menu"><Menu size={20} /></button><div className="hidden md:block"><span className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">{format(new Date(), 'EEEE · MMM d')}</span></div><div className="ml-auto flex items-center gap-3"><button type="button" className="relative rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" /></button><Link href="/profile" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted" data-testid="link-header-profile"><span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{user?.firstName?.slice(0, 1) ?? 'S'}</span><span className="hidden text-sm font-semibold sm:block">{user?.firstName ?? 'Student'}</span></Link></div></header><div className="mx-auto max-w-[1320px] p-5 sm:p-8">{children}</div></main>
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
  const allTasks = useListTasks();
  const toggleTask = (task: Task) => toggle.mutate({ id: task.id, data: { completed: !task.completed } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); } });
  const deleteTask = (task: Task) => { if (window.confirm(`Remove "${task.title}" from your plan?`)) del.mutate({ id: task.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListTasksQueryKey() }); toast({ title: 'Task removed' }); } }); };
  const today = data?.todayTasks ?? [];
  const upcoming = data?.upcomingTasks ?? [];
  return <div className="cc-page space-y-8">
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-semibold text-primary">A clear day starts here.</p><h1 className="cc-display text-4xl font-semibold leading-[.95] sm:text-5xl">Good morning, <span className="text-primary">student.</span></h1><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">One thoughtful next step is enough. Here’s what deserves your attention today.</p></div><AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-task-dashboard"><Plus size={17} /> Add task</AppButton></section>
    {isError ? <div className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>We couldn't load your study plan.</span><AppButton variant="outline" onClick={() => refetch()} data-testid="button-retry-dashboard">Try again</AppButton></div> : null}
    <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8"><div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Flame size={16} /> This week</div><h2 className="cc-display text-3xl font-semibold">Keep your rhythm.</h2><p className="mt-2 max-w-sm text-sm leading-6 text-sidebar-foreground/60">Small, consistent wins are what move a semester forward.</p></div><div className="grid size-16 place-items-center rounded-full border-[6px] border-primary/25 border-t-primary text-lg font-bold text-primary">{data?.completion.percentage ?? 0}%</div></div><div className="mt-7 grid grid-cols-7 gap-2">{(data?.completion.days ?? []).slice(0, 7).map((day, i) => <div key={day.date} className="text-center"><div className="mx-auto mb-2 h-20 w-full max-w-8 rounded-full bg-sidebar-accent p-1"><div className="flex h-full items-end"><div className="w-full rounded-full bg-primary" style={{ height: `${day.total ? Math.max(10, (day.completed / day.total) * 100) : 8}%` }} /></div></div><span className="text-[10px] font-semibold uppercase text-sidebar-foreground/45">{format(parseISO(day.date), 'EEEEE')}</span></div>)}{!data?.completion.days?.length ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="text-center"><div className="mx-auto mb-2 h-20 w-full max-w-8 rounded-full bg-sidebar-accent" /><span className="text-[10px] text-sidebar-foreground/45">—</span></div>) : null}</div><div className="mt-5 flex items-center justify-between text-xs text-sidebar-foreground/55"><span>{data?.completion.completed ?? 0} completed</span><span>{data?.completion.total ?? 0} planned this week</span></div></div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">A gentle nudge</p><h2 className="cc-display mt-2 text-2xl font-semibold">You’ve got this.</h2></div><span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><Sparkles size={19} /></span></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Start with the task that takes less than 20 minutes. Momentum usually follows.</p><Link href="/tasks" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3" data-testid="link-view-plan">View your plan <ArrowRight size={16} /></Link></div>
    </section>
    <section className="grid gap-8 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Today</p><h2 className="cc-display mt-1 text-2xl font-semibold">{isToday(new Date()) ? 'Your focus list' : 'Your tasks'}</h2></div><Link href="/tasks" className="text-xs font-bold text-primary hover:underline" data-testid="link-all-tasks">See all</Link></div>{isLoading ? <TaskSkeleton /> : today.length ? <div>{today.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} />)}</div> : <EmptyState title="A blank page, for now." description="Nothing is due today. Use the breathing room to get ahead." action={<AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-first-task"><Plus size={16} /> Add a task</AppButton>} />}</div>
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
  return <div className="cc-page space-y-7"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">The full picture</p><h1 className="cc-display mt-1 text-4xl font-semibold">All tasks</h1><p className="mt-2 text-sm text-muted-foreground">Keep every assignment, exam, and idea in view.</p></div><AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-task"><Plus size={17} /> Add task</AppButton></section>
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-muted-foreground" size={17} /><input className="field pl-10" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or courses..." data-testid="input-search-tasks" /></div><div className="flex gap-2 overflow-x-auto"><select className="field min-w-[118px]" value={status} onChange={e => setStatus(e.target.value as typeof status)} data-testid="select-task-status"><option value="all">All tasks</option><option value="active">Active</option><option value="completed">Completed</option></select><select className="field min-w-[124px]" value={type} onChange={e => setType(e.target.value)} data-testid="select-task-filter-type"><option value="all">Every type</option>{Object.entries(typeLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div></div>
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">{tasks.isLoading ? <TaskSkeleton rows={7} /> : tasks.isError ? <EmptyState title="Couldn't load tasks" description="There was a hiccup bringing in your list." action={<AppButton variant="outline" onClick={() => tasks.refetch()} data-testid="button-retry-tasks">Try again</AppButton>} /> : filtered.length ? <div>{filtered.map(task => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={task => setDialog({ open: true, task })} onDelete={deleteTask} />)}</div> : <EmptyState title={search ? 'No matches here.' : 'Your list is clear.'} description={search ? 'Try another phrase or clear the search.' : 'Add the next thing you want to make progress on.'} action={!search ? <AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-empty-task"><Plus size={16} /> Add a task</AppButton> : null} />}</div>
    <TaskDialog open={dialog.open} onOpenChange={open => setDialog({ ...dialog, open })} editingTask={dialog.task} courses={courses.data ?? []} />
  </div>;
}

function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const tasks = useListTasks();
  const courses = useListCourses();
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = (day: Date) => (tasks.data ?? []).filter(task => isSameDay(parseISO(task.dueDate), day));
  return <div className="cc-page space-y-7"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary">Make space for what matters</p><h1 className="cc-display mt-1 text-4xl font-semibold">Calendar</h1><p className="mt-2 text-sm text-muted-foreground">A week at a glance, without the overwhelm.</p></div><div className="flex gap-2"><AppButton variant="outline" onClick={() => setCursor(new Date())} data-testid="button-calendar-today">Today</AppButton><AppButton onClick={() => setDialog({ open: true, task: null })} data-testid="button-add-task-calendar"><Plus size={17} /> Add task</AppButton></div></section><div className="flex items-center justify-between"><button className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={() => setCursor(addDays(cursor, -7))} data-testid="button-calendar-previous">Previous week</button><h2 className="cc-display text-xl font-semibold">{format(week[0], 'MMM d')} — {format(week[6], 'MMM d, yyyy')}</h2><button className="rounded-xl px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={() => setCursor(addDays(cursor, 7))} data-testid="button-calendar-next">Next week</button></div><div className="grid gap-3 md:grid-cols-7">{week.map(day => <div key={day.toISOString()} className={`min-h-[230px] rounded-2xl border p-3 ${isToday(day) ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'}`} data-testid={`day-calendar-${format(day, 'yyyy-MM-dd')}`}><div className="mb-4 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{format(day, 'EEE')}</span><span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>{format(day, 'd')}</span></div><div className="space-y-2">{tasks.isLoading ? <div className="h-14 animate-pulse rounded-xl bg-muted" /> : byDay(day).map(task => <div key={task.id} className={`rounded-xl p-2.5 ${typeColors[task.type]}`}><div className={`text-xs font-bold leading-4 ${task.completed ? 'line-through opacity-60' : ''}`}>{task.title}</div><div className="mt-1 text-[10px] font-semibold opacity-75">{task.courseCode}{task.dueTime ? ` · ${task.dueTime}` : ''}</div></div>)}{!tasks.isLoading && byDay(day).length === 0 ? <div className="pt-3 text-center text-[11px] text-muted-foreground/60">Clear</div> : null}</div></div>)}</div><TaskDialog open={dialog.open} onOpenChange={open => setDialog({ ...dialog, open })} editingTask={dialog.task} courses={courses.data ?? []} /></div>;
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

function LandingPage() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <Redirect to="/dashboard" />;
  return <div className="cc-grain min-h-[100dvh] overflow-hidden bg-background"><header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8"><Logo /><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="link-sign-up">Get started</Link></div></header><main><section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:pb-28"><div className="cc-page"><Badge className="bg-secondary text-secondary-foreground"><span className="mr-1.5 size-1.5 rounded-full bg-[#278476]" />Built for the in-between moments</Badge><h1 className="cc-display mt-7 max-w-xl text-6xl font-semibold leading-[.9] sm:text-7xl lg:text-[88px]">Study with a little more <span className="text-primary">clarity.</span></h1><p className="mt-7 max-w-md text-base leading-7 text-muted-foreground">Campus Connect keeps assignments, exams, projects, and the next right thing in one calm place — so you can spend less time organizing and more time learning.</p><div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sidebar px-5 text-sm font-bold text-sidebar-foreground shadow-lg hover:-translate-y-0.5" data-testid="link-start-planning">Start planning <ArrowRight size={17} /></Link><span className="text-xs font-semibold text-muted-foreground">No clutter. Just momentum.</span></div></div><div className="relative min-h-[380px] sm:min-h-[470px]"><div className="absolute inset-5 rotate-3 rounded-[2.5rem] bg-secondary/60" /><div className="absolute inset-0 rounded-[2.5rem] bg-sidebar p-5 text-sidebar-foreground shadow-2xl sm:p-7"><div className="mb-8 flex items-center justify-between"><span className="text-sm font-bold">Today’s focus</span><span className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-primary">Tuesday</span></div><div className="rounded-2xl bg-sidebar-accent p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.14em] text-sidebar-foreground/45">Your rhythm</span><span className="text-2xl font-bold text-primary">72%</span></div><div className="mt-4 h-2 rounded-full bg-sidebar"><div className="h-full w-[72%] rounded-full bg-primary" /></div><p className="mt-3 text-xs text-sidebar-foreground/55">You’re building a steady week.</p></div><div className="mt-6 space-y-3"><div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent/60 p-4"><span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={14} /></span><span className="text-sm font-semibold line-through opacity-55">Read week 4 case study</span></div><div className="flex items-center gap-3 rounded-2xl border border-primary/45 bg-primary/10 p-4"><span className="size-7 rounded-full border-2 border-primary" /><div><span className="block text-sm font-semibold">Outline research proposal</span><span className="mt-1 block text-xs text-sidebar-foreground/50">SOC 203 · Due tomorrow</span></div></div><div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent/60 p-4"><span className="size-7 rounded-full border-2 border-sidebar-foreground/30" /><div><span className="block text-sm font-semibold">Review lecture notes</span><span className="mt-1 block text-xs text-sidebar-foreground/50">PSYC 204 · 25 min</span></div></div></div></div></div></section><section className="border-y border-border bg-secondary/30"><div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-3"><div><div className="mb-4 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><ListTodo size={18} /></div><h2 className="cc-display text-2xl font-semibold">A softer task list</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Capture what’s ahead, see the details, and check it off with a little satisfaction.</p></div><div><div className="mb-4 grid size-10 place-items-center rounded-xl bg-sidebar text-sidebar-foreground"><CalendarDays size={18} /></div><h2 className="cc-display text-2xl font-semibold">The week in view</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Dates and deadlines have a place, without turning your life into a spreadsheet.</p></div><div><div className="mb-4 grid size-10 place-items-center rounded-xl bg-[#e4f3f0] text-[#23746a]"><Clock3 size={18} /></div><h2 className="cc-display text-2xl font-semibold">Momentum, measured</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Notice your rhythm over time. Progress is more motivating when you can actually feel it.</p></div></div></section><section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8 sm:py-28"><p className="text-sm font-bold uppercase tracking-[.15em] text-primary">Your next chapter is already underway</p><h2 className="cc-display mx-auto mt-5 max-w-2xl text-5xl font-semibold leading-[.95] sm:text-6xl">Make room for the work that matters.</h2><Link href="/sign-up" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:-translate-y-0.5" data-testid="link-create-account">Create your account <ArrowRight size={17} /></Link></section></main><footer className="mx-auto flex max-w-6xl items-center justify-between border-t border-border px-5 py-7 text-xs text-muted-foreground sm:px-8"><Logo /><span>Made for the long semester.</span></footer></div>;
}

function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <div className="cc-grain flex min-h-[100dvh] items-center justify-center bg-secondary/35 px-4 py-8"><div className="w-full max-w-[440px]"><div className="mb-6 text-center"><Logo /></div>{mode === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></div>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function Router() {
  return <Switch><Route path="/" component={LandingPage} /><Route path="/sign-in/*?" component={() => <AuthPage mode="sign-in" />} /><Route path="/sign-up/*?" component={() => <AuthPage mode="sign-up" />} /><Route path="/dashboard" component={() => <Protected><AppShell><DashboardPage /></AppShell></Protected>} /><Route path="/tasks" component={() => <Protected><AppShell><TasksPage /></AppShell></Protected>} /><Route path="/calendar" component={() => <Protected><AppShell><CalendarPage /></AppShell></Protected>} /><Route path="/profile" component={() => <Protected><AppShell><ProfilePage /></AppShell></Protected>} /><Route path="/settings" component={() => <Protected><AppShell><SettingsPage /></AppShell></Protected>} /><Route component={() => <div className="p-10">Page not found. <Link href="/">Go home</Link></div>} /></Switch>;
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