import React from 'react';
import { useAuth } from '@clerk/react';
import { Link, Redirect } from 'wouter';
import { ArrowRight, BookOpen, Clock3, CalendarDays, ListTodo, Bot, Quote } from 'lucide-react';

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
      <span className={`grid size-9 place-items-center rounded-xl ${inverse ? 'bg-primary text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>
        <BookOpen size={18} strokeWidth={2.7} />
      </span>
      <span className={`cc-display text-[19px] font-bold tracking-tight ${inverse ? 'text-sidebar-foreground' : 'text-foreground'}`}>Campus Connect</span>
    </Link>
  );
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[.08em] ${className}`}>{children}</span>;
}

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const imagePath = (filename: string) => `${import.meta.env.BASE_URL}images/${filename}`;
  
  if (isSignedIn) return <Redirect to="/dashboard" />;

  return (
    <div className="cc-grain min-h-[100dvh] overflow-x-hidden bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8 relative z-10">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:-translate-y-0.5" data-testid="link-sign-up">Get started</Link>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-16 sm:px-8 sm:pt-28 lg:grid-cols-[1.1fr_.9fr] lg:pb-32">
          <div className="cc-page relative z-10">
            <Badge className="bg-secondary text-secondary-foreground border border-secondary/50 shadow-sm">
              <span className="mr-2 size-1.5 rounded-full bg-[#23746a] animate-pulse" />
              Your Personal Study Space
            </Badge>
            <h1 className="cc-display mt-8 max-w-xl text-6xl font-semibold leading-[.9] text-foreground sm:text-7xl lg:text-[88px]">
              Study with a little more <span className="text-primary italic">clarity.</span>
            </h1>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-muted-foreground">
              Campus Connect keeps assignments, exams, and flashcards in one calm place. Let AI help you study, while you focus on the learning.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <Link href="/sign-up" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-sidebar px-8 text-base font-bold text-sidebar-foreground shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl" data-testid="link-hero-start">
                Start planning <ArrowRight size={18} />
              </Link>
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <span className="flex -space-x-2">
                  {[1,2,3].map(i => <div key={i} className="size-8 rounded-full border-2 border-background bg-secondary" />)}
                </span>
                One workspace. Less context switching.
              </div>
            </div>
          </div>
          
          <div className="relative z-10 mx-auto w-full max-w-md lg:max-w-none cc-page" style={{ animationDelay: '200ms' }}>
            <div className="absolute -inset-4 rotate-6 rounded-[3rem] bg-secondary/30 blur-2xl" />
            <img 
              src={imagePath('study-collaboration.jpg')}
              alt="Students collaborating in a library"
              className="relative z-10 aspect-[4/5] w-full rounded-[2.5rem] object-cover shadow-2xl"
            />
            
            {/* Floating UI Elements */}
            <div className="absolute -left-12 bottom-20 z-20 hidden animate-[cc-rise_1s_ease-out_both_400ms] rounded-2xl border border-border bg-card p-4 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">AI Generated</p>
                  <p className="text-sm font-semibold">12 Flashcards saved</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="border-y border-border bg-card/50 py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mb-16 max-w-2xl text-center mx-auto">
              <h2 className="cc-display text-4xl font-semibold">Everything you need. Nothing you don't.</h2>
              <p className="mt-4 text-lg text-muted-foreground">A unified workspace designed to reduce friction and increase focus.</p>
            </div>
            
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-3xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                <div className="mb-6 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <ListTodo size={22} />
                </div>
                <h3 className="cc-display text-2xl font-semibold">A softer task list</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">Capture what's ahead, attach to your courses, and check it off with quiet satisfaction.</p>
              </div>
              <div className="rounded-3xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                <div className="mb-6 grid size-12 place-items-center rounded-xl bg-sidebar text-sidebar-foreground">
                  <CalendarDays size={22} />
                </div>
                <h3 className="cc-display text-2xl font-semibold">The week in view</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">Dates and deadlines have a place, without turning your life into an overwhelming spreadsheet.</p>
              </div>
              <div className="rounded-3xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
                <div className="mb-6 grid size-12 place-items-center rounded-xl bg-[#e4f3f0] text-[#23746a]">
                  <Bot size={22} />
                </div>
                <h3 className="cc-display text-2xl font-semibold">Study Studio</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">Your own AI assistant that explains concepts and generates flashcards automatically.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Narrative Section with Images */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div className="relative">
              <div className="absolute -inset-4 -rotate-3 rounded-[3rem] bg-primary/10 blur-xl" />
              <img 
                src={imagePath('study-focus.jpg')}
                alt="Student studying with focus"
                className="relative z-10 aspect-square w-full rounded-[2.5rem] object-cover shadow-xl"
              />
            </div>
            <div className="max-w-xl">
              <Badge className="bg-primary/15 text-primary mb-6">Designed for Focus</Badge>
              <h2 className="cc-display text-4xl font-semibold sm:text-5xl leading-tight">
                Turn your scattered notes into structured knowledge.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                We know how chaotic the semester gets. Campus Connect gives you a calm, personal dashboard where your tasks, deadlines, and study materials live in harmony. 
              </p>
              <ul className="mt-8 space-y-4">
                <li className="flex items-center gap-3 text-base font-semibold">
                  <div className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground"><ArrowRight size={14} /></div>
                  Track assignments by course
                </li>
                <li className="flex items-center gap-3 text-base font-semibold">
                  <div className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground"><ArrowRight size={14} /></div>
                  Generate flashcard decks in seconds
                </li>
                <li className="flex items-center gap-3 text-base font-semibold">
                  <div className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground"><ArrowRight size={14} /></div>
                  Review with spaced repetition
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="student-feedback" className="border-t border-border bg-sidebar py-24 text-sidebar-foreground">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mb-16 text-center">
              <h2 className="cc-display text-4xl font-semibold sm:text-5xl">What students are saying</h2>
              <p className="mt-4 text-sidebar-foreground/60">10 responses to “What did you like most about the app?”</p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-3">
              {[
                "How effective it has been to help me study",
                "I despise working with different apps than the ones I’m use to , I love that this one was easy",
                "Very easy to access and go around in",
                "The details",
                "It was very easy to navigate.",
                "I like it sets a plan to make flash cards for you so you can study",
                "Everything",
                "How easy to use it is",
                "Very simple to use",
                "Study Studio",
              ].map((quote, i) => (
                <figure key={i} className="m-0 flex min-w-0 flex-col justify-between rounded-3xl bg-sidebar-accent p-8" data-testid={`student-feedback-${i + 1}`}>
                  <div>
                    <Quote size={24} className="mb-6 text-primary" aria-hidden="true" />
                    <blockquote className="mb-8 break-words text-lg leading-relaxed">“{quote}”</blockquote>
                  </div>
                  <figcaption className="flex items-center gap-4 border-t border-sidebar-border pt-6">
                    <div className="grid size-12 place-items-center rounded-full bg-primary/20 text-xl font-bold text-primary">
                      S
                    </div>
                    <div>
                      <div className="font-bold">Student</div>
                      <div className="text-sm text-sidebar-foreground/60">Anonymous survey response</div>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none">
            <img src={imagePath('study-pair.jpg')} alt="Students studying together" className="w-full h-full object-cover blur-sm rounded-[3rem]" />
            <div className="absolute inset-0 bg-background/80" />
          </div>
          
          <div className="relative z-10 mx-auto max-w-2xl text-center rounded-[3rem] border border-border bg-card/90 p-12 shadow-2xl backdrop-blur-md sm:p-16">
            <p className="text-sm font-bold uppercase tracking-[.15em] text-primary">Ready to focus?</p>
            <h2 className="cc-display mx-auto mt-4 text-5xl font-semibold leading-tight sm:text-6xl">
              Your next chapter is already underway.
            </h2>
            <Link href="/sign-up" className="mt-10 inline-flex h-14 items-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all" data-testid="link-create-account-bottom">
              Create your account <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl items-center justify-between border-t border-border px-5 py-8 text-sm font-medium text-muted-foreground sm:px-8">
        <Logo />
        <span>Made for the long semester.</span>
      </footer>
    </div>
  );
}
