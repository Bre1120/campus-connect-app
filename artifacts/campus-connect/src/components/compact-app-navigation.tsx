import { Link } from 'wouter';
import { BookOpen, CalendarDays, LayoutDashboard, ListTodo, LogOut, Settings2, UserRound, UsersRound } from 'lucide-react';

type NavigationGroup = 'today' | 'study' | 'account';

type CompactAppNavigationProps = {
  location: string;
  onSignOut: () => void;
};

const primaryItems: { group: NavigationGroup; href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { group: 'today', href: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { group: 'study', href: '/tasks', label: 'Study', icon: BookOpen },
  { group: 'account', href: '/profile', label: 'Account', icon: UserRound },
];

const groupDetails: Record<NavigationGroup, {
  label: string;
  links: { href: string; label: string; icon: typeof LayoutDashboard }[];
}> = {
  today: {
    label: 'Today',
    links: [
      { href: '/dashboard', label: 'Today', icon: LayoutDashboard },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/community', label: 'Community', icon: UsersRound },
    ],
  },
  study: {
    label: 'Study',
    links: [
      { href: '/tasks', label: 'All tasks', icon: ListTodo },
      { href: '/study-studio', label: 'Study tools', icon: BookOpen },
    ],
  },
  account: {
    label: 'Account',
    links: [
      { href: '/profile', label: 'Profile', icon: UserRound },
      { href: '/settings', label: 'Settings', icon: Settings2 },
    ],
  },
};

function routeGroup(location: string): NavigationGroup {
  if (location === '/tasks' || location === '/study-studio') return 'study';
  if (location === '/profile' || location === '/settings') return 'account';
  return 'today';
}

export function CompactAppNavigation({ location }: Pick<CompactAppNavigationProps, 'location'>) {
  const activeGroup = routeGroup(location);

  return (
    <div className="cc-nav-shell">
      <nav aria-label="Main navigation" data-testid="nav-main" className="mx-auto grid max-w-[1320px] grid-cols-3 gap-2 px-4 py-2 sm:px-8">
        {primaryItems.map(item => {
          const Icon = item.icon;
          const active = activeGroup === item.group;
          return (
            <Link
              key={item.group}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`cc-nav-primary ${active ? 'cc-nav-primary-active' : ''}`}
              data-testid={`link-nav-${item.group}`}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function GroupNavigation({ location, onSignOut }: CompactAppNavigationProps) {
  const activeGroup = routeGroup(location);
  const activeDetails = groupDetails[activeGroup];
  return (
      <nav
        aria-label={`${activeDetails.label} navigation`}
        data-testid={`nav-group-${activeGroup}`}
        className="cc-nav-secondary"
      >
        <div className="flex min-h-11 flex-wrap items-center gap-1 p-1 sm:gap-2">
          {activeDetails.links.map(item => {
            const Icon = item.icon;
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`cc-nav-secondary-link ${active ? 'cc-nav-secondary-link-active' : ''}`}
                data-testid={`link-nav-${item.href.slice(1)}`}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {activeGroup === 'account' ? (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out of Campus Connect"
              className="cc-nav-secondary-link cc-nav-signout"
              data-testid="button-account-signout"
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          ) : null}
        </div>
      </nav>
  );
}
