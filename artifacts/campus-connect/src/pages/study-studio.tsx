import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import {
  BrainCircuit, LayoutGrid, Plus, BookOpen, Bot, Sparkles, X, ChevronLeft, ChevronRight, Check, CheckCircle2, Circle, Flame, Play, Trash2, ArrowRight
} from 'lucide-react';

import {
  useListFlashcardDecks,
  getListFlashcardDecksQueryKey,
  useCreateFlashcardDeck,
  useGetFlashcardDeck,
  getGetFlashcardDeckQueryKey,
  useDeleteFlashcardDeck,
  useUpdateFlashcardConfidence,
  useAskStudyAssistant,
  useListCourses,
  type FlashcardDeck,
  type FlashcardDraft,
  type Flashcard,
  type Course
} from '@workspace/api-client-react';

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em] ${className}`}>{children}</span>;
}

function AppButton({ children, variant = 'primary', className = '', ...props }: { children: React.ReactNode; variant?: 'primary' | 'quiet' | 'outline' | 'danger'; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md',
    quiet: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    outline: 'border border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary/5',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
  };
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

const deckSchema = z.object({
  title: z.string().min(1, 'Give this deck a name'),
  description: z.string().optional(),
  courseId: z.string().optional(),
  cards: z.array(z.object({
    front: z.string().min(1, 'Front cannot be empty'),
    back: z.string().min(1, 'Back cannot be empty')
  })).min(1, 'Add at least one card')
});
type DeckFormValues = z.infer<typeof deckSchema>;

export function StudyStudioPage() {
  const [view, setView] = useState<'dashboard' | 'assistant' | 'create-deck' | 'deck-detail' | 'review'>('dashboard');
  const [activeDeckId, setActiveDeckId] = useState<number | null>(null);

  const { data: courses } = useListCourses();

  return (
    <div className="cc-page pb-20">
      {view === 'dashboard' && <DashboardView onNavigate={setView} onSelectDeck={(id) => { setActiveDeckId(id); setView('deck-detail'); }} />}
      {view === 'assistant' && <AssistantView onNavigate={setView} courses={courses ?? []} />}
      {view === 'create-deck' && <CreateDeckView onNavigate={setView} courses={courses ?? []} />}
      {view === 'deck-detail' && activeDeckId && <DeckDetailView id={activeDeckId} onNavigate={setView} onReview={() => setView('review')} />}
      {view === 'review' && activeDeckId && <ReviewView id={activeDeckId} onNavigate={setView} />}
    </div>
  );
}

function DashboardView({ onNavigate, onSelectDeck }: { onNavigate: (v: any) => void; onSelectDeck: (id: number) => void }) {
  const { data: decks, isLoading, isError, refetch } = useListFlashcardDecks();

  return (
    <div className="space-y-8 cc-stagger">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">Your focus center</p>
          <h1 className="cc-display text-4xl font-semibold leading-[.95] sm:text-5xl">Study Studio</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Generate flashcards with AI or build your own. Master your material through active recall.
          </p>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <button onClick={() => onNavigate('assistant')} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md" data-testid="card-ai-assistant">
          <div className="absolute -right-4 -top-4 size-24 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bot size={22} />
          </div>
          <h3 className="cc-display text-2xl font-semibold">AI Study Assistant</h3>
          <p className="mt-2 text-sm text-muted-foreground">Ask questions, explain concepts, and let AI generate study cards for you.</p>
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-primary">
            Ask a question <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </div>
        </button>
        
        <button onClick={() => onNavigate('create-deck')} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-secondary-foreground/30 hover:shadow-md" data-testid="card-create-deck">
          <div className="absolute -right-4 -top-4 size-24 rounded-full bg-secondary/20 transition-transform group-hover:scale-150" />
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-secondary text-secondary-foreground">
            <LayoutGrid size={22} />
          </div>
          <h3 className="cc-display text-2xl font-semibold">Manual Decks</h3>
          <p className="mt-2 text-sm text-muted-foreground">Build your own custom flashcard decks piece by piece.</p>
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-secondary-foreground">
            Create a deck <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </div>
        </button>
      </div>

      <section className="pt-4">
        <h2 className="cc-display mb-6 text-2xl font-semibold">Your Decks</h2>
        {isError ? (
          <div className="flex flex-col items-center rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center">
            <p className="font-semibold">Your decks could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try again without losing your place.</p>
            <AppButton variant="outline" className="mt-4" onClick={() => refetch()}>Try again</AppButton>
          </div>
        ) : isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : !decks?.length ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
              <BrainCircuit size={21} />
            </div>
            <h3 className="cc-display text-xl font-semibold">No decks yet.</h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Use the AI assistant to generate some, or build your own from scratch.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map(deck => (
              <button key={deck.id} onClick={() => onSelectDeck(deck.id)} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5" data-testid={`deck-card-${deck.id}`}>
                <div>
                  <h3 className="font-bold leading-tight">{deck.title}</h3>
                  {deck.courseName && <div className="mt-1 text-xs font-semibold text-primary">{deck.courseName}</div>}
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{deck.description || 'No description'}</p>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1.5"><BookOpen size={14} /> {deck.cardCount} cards</span>
                  <span>{format(parseISO(deck.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AssistantView({ onNavigate, courses }: { onNavigate: (v: any) => void; courses: Course[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ask = useAskStudyAssistant();
  const createDeck = useCreateFlashcardDeck();
  
  const [prompt, setPrompt] = useState('');
  const [courseId, setCourseId] = useState('');
  const [result, setResult] = useState<{ answer: string; suggestedTitle: string; suggestedCards: FlashcardDraft[] } | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [resultCourseId, setResultCourseId] = useState<number | null>(null);
  const [deckSaved, setDeckSaved] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);
  const validPrompt = prompt.trim().length >= 3 && prompt.length <= 12000;

  useEffect(() => {
    if (result) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  const clearConversation = () => {
    setConversation([]);
    setResult(null);
    setPrompt('');
    setDeckSaved(false);
    ask.reset();
    createDeck.reset();
  };

  const errorData = ask.error?.data as { error?: string } | undefined;
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validPrompt || ask.isPending || createDeck.isPending) return;
    const question = prompt.trim();
    const selectedCourse = courseId ? Number(courseId) : null;
    // Keep the original notes/question plus the most recent follow-ups.
    const history = conversation.length > 12
      ? [...conversation.slice(0, 2), ...conversation.slice(-10)]
      : conversation;
    setResult(null);
    setDeckSaved(false);
    createDeck.reset();
    ask.mutate({ data: { prompt: question, courseId: selectedCourse, history } }, {
      onSuccess: (data) => {
        setResult(data);
        setResultCourseId(selectedCourse);
        setConversation(previous => [...previous, { role: 'user', content: question }, { role: 'assistant', content: data.answer }]);
        setPrompt('');
      },
    });
  };

  const handleSaveDeck = () => {
    if (!result?.suggestedCards.length || createDeck.isPending || ask.isPending || deckSaved) return;
    createDeck.mutate({
      data: {
        title: result.suggestedTitle,
        description: `Generated from AI Assistant on ${format(new Date(), 'MMM d, yyyy')}`,
        courseId: resultCourseId,
        cards: result.suggestedCards
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFlashcardDecksQueryKey() });
        setDeckSaved(true);
        toast({ title: 'Deck saved', description: 'Find it in your Study Studio dashboard.' });
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 cc-stagger">
      <div className="flex items-center gap-2">
        <button onClick={() => onNavigate('dashboard')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" data-testid="button-back">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-semibold uppercase tracking-[.14em] text-muted-foreground">AI Study Assistant</span>
        {conversation.length > 0 && <button type="button" onClick={clearConversation} disabled={ask.isPending || createDeck.isPending} className="ml-auto rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50" data-testid="button-new-ai-conversation">New conversation</button>}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="cc-display text-2xl font-semibold">{conversation.length ? 'Keep learning' : 'What are you studying?'}</h2>
            <p className="text-sm text-muted-foreground">Paste notes, explore a concept, or ask for a practice quiz. Follow-up questions use this conversation’s context.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!conversation.length && <div className="flex flex-wrap gap-2">
            {['Explain a concept with an example', 'Turn my notes into flashcards', 'Help me plan around my deadlines'].map(example => <button key={example} type="button" disabled={ask.isPending} onClick={() => setPrompt(example === 'Explain a concept with an example' ? 'Explain [your topic] simply, with a worked example.' : example === 'Turn my notes into flashcards' ? 'Make flashcards from these notes:\n\n[paste your notes here]' : 'Help me build a realistic study plan around my upcoming deadlines. Ask me how much time I have if needed.')} className="rounded-full border border-border px-3 py-2 text-xs font-semibold hover:border-primary">{example}</button>)}
          </div>}
          <label htmlFor="ai-study-prompt" className="block text-sm font-semibold">{conversation.length ? 'Your follow-up question' : 'Your question or notes'}</label>
          <textarea
            id="ai-study-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Explain the process of cellular respiration in simple terms..."
            className="field min-h-32 resize-y bg-background"
            disabled={ask.isPending || createDeck.isPending}
            maxLength={12000}
            minLength={3}
            required
            data-testid="input-ai-prompt"
          />
          <p className="text-xs text-muted-foreground">{prompt.length.toLocaleString()} / 12,000 characters · AI can make mistakes—check important details against your course materials.</p>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <select
              value={courseId}
              onChange={(e) => {
                if (conversation.length && !window.confirm('Changing course starts a new conversation. Continue?')) return;
                setCourseId(e.target.value);
                if (conversation.length) clearConversation();
              }}
              aria-label="Course context"
              className="field w-full sm:w-64"
              disabled={ask.isPending || createDeck.isPending}
              data-testid="select-ai-course"
            >
              <option value="">No specific course</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
              ))}
            </select>
            <AppButton type="submit" disabled={!validPrompt || ask.isPending || createDeck.isPending} data-testid="button-ai-submit">
              {ask.isPending ? 'Thinking...' : 'Ask Assistant'}
            </AppButton>
          </div>
        </form>
        {ask.isError ? (
          <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            {errorData?.error || 'Could not reach the assistant. Your question is still here—check your connection and try again.'}
          </div>
        ) : null}
      </div>
      {ask.isPending && <p role="status" aria-live="polite" className="rounded-xl bg-secondary/30 p-4 text-sm text-secondary-foreground">Working on your question and study material…</p>}

      {conversation.length > 0 && <div ref={answerRef} className="scroll-mt-24 space-y-4" aria-live="polite" data-testid="ai-conversation">
        {conversation.map((message, index) => <div key={index} className={`min-w-0 rounded-2xl border border-border p-5 sm:p-6 ${message.role === 'user' ? 'bg-secondary/20' : 'bg-card shadow-sm'}`}>
          <h3 className="mb-3 text-sm font-bold text-primary">{message.role === 'user' ? 'You' : 'Study Assistant'}</h3>
          <div className="prose prose-sm max-w-none break-words dark:prose-invert [&_pre]:max-w-full [&_pre]:overflow-x-auto">
            <ReactMarkdown components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{message.content}</ReactMarkdown>
          </div>
        </div>)}
      </div>}

      {result && result.suggestedCards.length > 0 && (
        <div className="space-y-6 cc-stagger">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="cc-display text-xl font-semibold">{result.suggestedTitle}</h3>
                <p className="text-sm text-muted-foreground">We generated {result.suggestedCards.length} cards based on the answer.</p>
              </div>
              <AppButton onClick={handleSaveDeck} disabled={createDeck.isPending || deckSaved || ask.isPending} data-testid="button-save-ai-deck">
                {createDeck.isPending ? 'Saving...' : deckSaved ? 'Deck saved' : 'Save as Deck'}
              </AppButton>
            </div>
            {createDeck.isError && <p role="alert" className="mb-4 text-sm text-destructive">Could not save your deck. Your cards are still here—please try again.</p>}
            
            <div className="grid gap-4 sm:grid-cols-2">
              {result.suggestedCards.map((card, i) => (
                <div key={i} className="rounded-xl border border-border bg-background p-4 text-sm">
                  <div className="mb-2 font-bold text-primary">Q: {card.front}</div>
                  <div className="text-muted-foreground">A: {card.back}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDeckView({ onNavigate, courses }: { onNavigate: (v: any) => void; courses: Course[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const create = useCreateFlashcardDeck();

  const form = useForm<DeckFormValues>({
    resolver: zodResolver(deckSchema),
    defaultValues: { title: '', description: '', courseId: '', cards: [{ front: '', back: '' }, { front: '', back: '' }] }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'cards' });

  const submit = (values: DeckFormValues) => {
    create.mutate({
      data: {
        title: values.title,
        description: values.description,
        courseId: values.courseId ? Number(values.courseId) : null,
        cards: values.cards
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFlashcardDecksQueryKey() });
        toast({ title: 'Deck created', description: 'Your cards are ready for review.' });
        onNavigate('dashboard');
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 cc-stagger">
      <div className="flex items-center gap-2">
        <button onClick={() => onNavigate('dashboard')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" data-testid="button-back">
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-semibold uppercase tracking-[.14em] text-muted-foreground">Create Deck</span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-8">
            <div className="space-y-4 border-b border-border pb-8">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Deck Title</FormLabel><FormControl><input className="field bg-background text-lg font-bold" placeholder="e.g. Chapter 4 Key Terms" {...field} data-testid="input-deck-title" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><input className="field bg-background" placeholder="What is this deck about?" {...field} data-testid="input-deck-desc" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="courseId" render={({ field }) => (
                  <FormItem><FormLabel>Course</FormLabel><FormControl>
                    <select className="field bg-background" {...field} data-testid="select-deck-course">
                      <option value="">No specific course</option>
                      {courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                    </select>
                  </FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="cc-display text-xl font-semibold">Flashcards</h3>
                <span className="text-xs font-bold text-muted-foreground">{fields.length} cards</span>
              </div>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="group relative grid gap-4 rounded-xl border border-border bg-background p-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="absolute -left-3 top-4 hidden h-full w-1 rounded-r-lg bg-primary opacity-0 transition-opacity group-focus-within:opacity-100 sm:block" />
                    <FormField control={form.control} name={`cards.${index}.front`} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs text-muted-foreground">Front (Question)</FormLabel><FormControl><textarea className="field min-h-20 resize-y" placeholder="Term or question" {...field} data-testid={`input-card-front-${index}`} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name={`cards.${index}.back`} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs text-muted-foreground">Back (Answer)</FormLabel><FormControl><textarea className="field min-h-20 resize-y" placeholder="Definition or explanation" {...field} data-testid={`input-card-back-${index}`} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex pt-6">
                      <button type="button" onClick={() => remove(index)} disabled={fields.length === 1} className="self-start rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30" data-testid={`button-remove-card-${index}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <AppButton type="button" variant="outline" className="mt-4 w-full" onClick={() => append({ front: '', back: '' })} data-testid="button-add-card">
                <Plus size={16} /> Add another card
              </AppButton>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <AppButton type="submit" disabled={create.isPending} data-testid="button-save-deck">
                {create.isPending ? 'Saving...' : 'Create Deck'}
              </AppButton>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

function DeckDetailView({ id, onNavigate, onReview }: { id: number; onNavigate: (v: any) => void; onReview: () => void }) {
  const { data: deck, isLoading, isError } = useGetFlashcardDeck(id, { query: { enabled: !!id, queryKey: getGetFlashcardDeckQueryKey(id) } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteFlashcardDeck();

  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (isError || !deck) return <div className="p-10 text-center">Error loading deck</div>;

  const handleDelete = () => {
    if (window.confirm('Delete this entire deck?')) {
      del.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFlashcardDecksQueryKey() });
          toast({ title: 'Deck deleted' });
          onNavigate('dashboard');
        }
      });
    }
  };

  const confidenceStats = deck.cards.reduce((acc, card) => {
    acc[card.confidence] = (acc[card.confidence] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="mx-auto max-w-5xl space-y-8 cc-stagger">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate('dashboard')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" data-testid="button-back">
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-semibold uppercase tracking-[.14em] text-muted-foreground">Deck details</span>
        </div>
        <button onClick={handleDelete} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-destructive hover:bg-destructive/10" data-testid="button-delete-deck">Delete Deck</button>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="cc-display text-4xl font-semibold leading-tight">{deck.title}</h1>
          {deck.courseName && <Badge className="mt-3 bg-secondary/50 text-secondary-foreground">{deck.courseName}</Badge>}
          <p className="mt-4 max-w-xl text-muted-foreground">{deck.description || 'No description provided.'}</p>
        </div>
        
        <div className="flex shrink-0 flex-col gap-3 rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-lg md:w-72">
          <div className="flex items-center justify-between border-b border-sidebar-border pb-4">
            <span className="text-sm font-bold">Total Cards</span>
            <span className="text-2xl font-bold text-primary">{deck.cardCount}</span>
          </div>
          <div className="space-y-2 pt-2 text-sm text-sidebar-foreground/70">
            <div className="flex justify-between"><span>New</span> <span>{confidenceStats.new || 0}</span></div>
            <div className="flex justify-between"><span>Learning</span> <span className="text-primary">{confidenceStats.learning || 0}</span></div>
            <div className="flex justify-between"><span>Mastered</span> <span className="text-[#23746a]">{confidenceStats.mastered || 0}</span></div>
          </div>
          <AppButton className="mt-4 w-full" onClick={onReview} data-testid="button-start-review">
            <Play size={16} fill="currentColor" /> Start Review
          </AppButton>
        </div>
      </div>

      <div className="pt-4">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-[.13em] text-muted-foreground">Cards in deck</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deck.cards.map((card, i) => (
            <div key={card.id} className="relative rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 pb-4 border-b border-border/60">
                <span className="absolute right-4 top-4 text-xs font-bold text-muted-foreground opacity-50">#{i + 1}</span>
                <p className="font-semibold text-primary">{card.front}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.back}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewView({ id, onNavigate }: { id: number; onNavigate: (v: any) => void }) {
  const { data: deck, isLoading } = useGetFlashcardDeck(id, { query: { enabled: !!id, queryKey: getGetFlashcardDeckQueryKey(id) } });
  const updateConf = useUpdateFlashcardConfidence();
  const queryClient = useQueryClient();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  // Filter cards to review? Let's just review all for now.
  const cards = deck?.cards ?? [];

  if (isLoading) return <div className="p-10 text-center">Loading...</div>;
  if (!deck || !cards.length) return <div className="p-10 text-center">No cards to review.</div>;

  if (finished) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center cc-page">
        <div className="grid size-24 place-items-center rounded-full bg-primary/10 text-primary">
          <Flame size={48} />
        </div>
        <div>
          <h2 className="cc-display text-4xl font-semibold">Review Complete</h2>
          <p className="mt-2 text-muted-foreground">You reviewed {cards.length} cards in {deck.title}.</p>
        </div>
        <AppButton onClick={() => onNavigate('deck-detail')} data-testid="button-finish-review">Back to Deck</AppButton>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  const handleConfidence = (confidence: 'new' | 'learning' | 'mastered') => {
    updateConf.mutate({
      id: currentCard.id,
      data: { confidence }
    }, {
      onSuccess: () => {
        // Optimistic update could go here, but invalidate is fine for end of session
        queryClient.invalidateQueries({ queryKey: getGetFlashcardDeckQueryKey(deck.id) });
        nextCard();
      }
    });
  };

  const nextCard = () => {
    setFlipped(false);
    if (currentIndex + 1 >= cards.length) {
      setFinished(true);
    } else {
      setCurrentIndex(c => c + 1);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-2xl flex-col cc-page">
      <div className="mb-8 flex items-center justify-between">
        <button onClick={() => onNavigate('deck-detail')} className="rounded-xl p-2 text-muted-foreground hover:bg-muted" data-testid="button-exit-review">
          <X size={20} />
        </button>
        <div className="text-sm font-bold text-muted-foreground">
          {currentIndex + 1} <span className="opacity-50">/ {cards.length}</span>
        </div>
      </div>

      <div className="flex-1 perspective-1000">
        <div 
          onClick={() => setFlipped(!flipped)}
          className={`relative h-[400px] w-full cursor-pointer transition-all duration-500 transform-style-3d ${flipped ? 'rotate-y-180' : ''}`}
          data-testid="flashcard-flip-container"
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-border bg-card p-10 text-center shadow-lg backface-hidden">
            <span className="absolute left-6 top-6 text-xs font-bold uppercase tracking-[.15em] text-primary">Front</span>
            <h2 className="text-3xl font-semibold leading-relaxed">{currentCard.front}</h2>
            <div className="absolute bottom-6 text-xs font-semibold text-muted-foreground animate-pulse">Click to flip</div>
          </div>
          
          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border-2 border-primary bg-primary/5 p-10 text-center shadow-xl backface-hidden rotate-y-180">
            <span className="absolute left-6 top-6 text-xs font-bold uppercase tracking-[.15em] text-primary">Back</span>
            <div className="prose prose-lg prose-slate"><p>{currentCard.back}</p></div>
          </div>
        </div>
      </div>

      <div className={`mt-10 flex justify-center gap-3 transition-opacity duration-300 ${flipped ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <button onClick={() => handleConfidence('new')} className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/20 bg-card px-6 py-4 text-destructive hover:bg-destructive/5" data-testid="button-conf-new">
          <Circle size={24} />
          <span className="text-xs font-bold uppercase">Forgot</span>
        </button>
        <button onClick={() => handleConfidence('learning')} className="flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-card px-6 py-4 text-primary hover:bg-primary/5" data-testid="button-conf-learning">
          <Check size={24} />
          <span className="text-xs font-bold uppercase">Hard</span>
        </button>
        <button onClick={() => handleConfidence('mastered')} className="flex flex-col items-center gap-2 rounded-2xl border border-[#23746a]/20 bg-card px-6 py-4 text-[#23746a] hover:bg-[#23746a]/5" data-testid="button-conf-mastered">
          <CheckCircle2 size={24} />
          <span className="text-xs font-bold uppercase">Easy</span>
        </button>
      </div>
    </div>
  );
}
