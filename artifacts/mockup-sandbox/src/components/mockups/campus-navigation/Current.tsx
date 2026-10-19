import { useState, type ReactNode, type AnchorHTMLAttributes } from 'react';
import { format } from 'date-fns';
import { BookOpen, LayoutDashboard, ListTodo, CalendarDays, UsersRound, ChevronRight, UserRound, Settings2, LogOut, Menu, X, Bell } from 'lucide-react';
import './_group.css';
const basePath = '';
const useLocation = (): readonly [string, () => void] => ['/dashboard', () => {}];
const useUser = () => ({user: {firstName: 'Student'}});
const useClerk = () => ({signOut: (_options: unknown) => {}});
function Link({href, ...props}: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a href={href} {...props} onClick={e => e.preventDefault()} />; }
function Logo({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
    <span className={`grid size-9 place-items-center rounded-xl ${inverse ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>
      <BookOpen size={18} strokeWidth={2.7} />
    </span>
    <span className={`cc-display text-[19px] font-bold tracking-tight ${inverse ? 'text-sidebar-foreground' : 'text-foreground'}`}>Campus Connect</span>
  </Link>;
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
    { href: '/study-studio', label: 'Flashcards & AI', icon: BookOpen },
    { href: '/community', label: 'Community', icon: UsersRound },
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


export default function Current() { return <AppShell><h1 className="cc-display text-4xl">Good morning, Student.</h1><p className="mt-4 text-muted-foreground">Your campus workspace.</p></AppShell>; }
