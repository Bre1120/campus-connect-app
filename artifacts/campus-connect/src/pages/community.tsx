import React, { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  MessageSquare, ShieldAlert, Send, Trash2, AlertCircle, Users, LifeBuoy
} from 'lucide-react';
import {
  useListCommunityMessages,
  getListCommunityMessagesQueryKey,
  useCreateCommunityMessage,
  useDeleteCommunityMessage,
  useReportCommunityMessage,
  type CommunityMessageRoom,
  type CommunityMessageAuthorRole,
  type CommunityMessage,
  type CommunityReportInputReason
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

function AppButton({ children, variant = 'primary', className = '', ...props }: { children: ReactNode; variant?: 'primary' | 'quiet' | 'outline' | 'danger'; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-md',
    quiet: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    outline: 'border border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary/5',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
  };
  return (
    <button 
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CommunityPage() {
  const [room, setRoom] = useState<CommunityMessageRoom>('students');
  
  return (
    <div className="cc-page flex h-[calc(100dvh-280px)] min-h-[360px] flex-col space-y-4 pb-2 lg:h-[calc(100dvh-240px)]">
       <div className="flex items-end justify-between shrink-0">
         <div>
           <p className="mb-2 text-sm font-semibold text-primary">Join the discussion</p>
           <h1 className="cc-display text-4xl font-semibold leading-[.95]">Community</h1>
         </div>
       </div>
       
       <div className="flex gap-2 shrink-0">
         <button 
           onClick={() => setRoom('students')} 
           className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${room === 'students' ? 'bg-sidebar text-sidebar-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}
         >
           <Users size={16} /> Students Room
         </button>
         <button 
           onClick={() => setRoom('help')} 
           className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${room === 'help' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}
         >
           <LifeBuoy size={16} /> Help Room
         </button>
       </div>

       <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
         <div className="flex items-start gap-3 border-b border-border/60 bg-secondary/15 p-4 text-xs leading-5 text-secondary-foreground shrink-0">
           <ShieldAlert size={16} className="mt-0.5 shrink-0 text-secondary-foreground/70" />
           <p>
             <strong className="font-bold">Community Guidelines:</strong> Conversations are visible to all signed-in members. 
              Please do not post personal information. Reports are recorded, but there is no staffed moderation queue yet.
           </p>
         </div>
         
          <MessageFeed key={room} room={room} />
       </div>
    </div>
  );
}

function MessageFeed({ room }: { room: CommunityMessageRoom }) {
  const { data: messages, isLoading, isError, refetch } = useListCommunityMessages(
    { room }, 
    { query: { refetchInterval: 3000, queryKey: getListCommunityMessagesQueryKey({ room }) } }
  );
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages?.at(-1)?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance < 180 || element.dataset.room !== room) {
      element.scrollTop = element.scrollHeight;
    }
    element.dataset.room = room;
  }, [lastMessageId, room]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {isLoading && <div className="py-10 text-center text-sm font-medium text-muted-foreground animate-pulse">Loading messages...</div>}
        {isError && <div className="py-10 text-center text-sm font-medium text-destructive" role="alert">Failed to load messages. <button type="button" onClick={() => refetch()} className="underline">Try again</button></div>}
        {messages?.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {messages?.length === 0 && !isLoading && !isError && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <MessageSquare size={32} className="mb-3 opacity-20" />
            <p className="text-sm">No messages yet. Be the first to say hello!</p>
          </div>
        )}
      </div>
      
      <MessageInput room={room} />
    </>
  );
}

function MessageBubble({ message }: { message: CommunityMessage }) {
  const [reportOpen, setReportOpen] = useState(false);
  const del = useDeleteCommunityMessage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isTutorOrAdvisor = message.authorRole === 'tutor' || message.authorRole === 'advisor';

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      del.mutate({ id: message.id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCommunityMessagesQueryKey({ room: message.room }) });
          toast({ title: 'Message deleted' });
        },
        onError: () => toast({ title: 'Could not delete message', description: 'Please try again.', variant: 'destructive' }),
      });
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = parseISO(iso);
      if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`;
      if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
      return format(d, 'MMM d, h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <div className={`group flex w-full flex-col ${message.isMine ? 'items-end' : 'items-start'}`}>
      <div className={`mb-1.5 flex items-baseline gap-2 px-1 ${message.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-xs font-bold text-foreground/80">{message.authorName}</span>
        <span className="text-[10px] font-semibold text-muted-foreground">{formatTime(message.createdAt)}</span>
      </div>
      
      {isTutorOrAdvisor && (
        <div className={`mb-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-primary ${message.isMine ? 'text-right' : 'text-left'}`}>
          Self-described {message.authorRole} — not verified
        </div>
      )}

      <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${message.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${message.isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted/60 text-foreground rounded-bl-sm border border-border/50'}`}>
          <div className="whitespace-pre-wrap break-words">{message.body}</div>
        </div>

        {message.isMine && (
          <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 shrink-0 mb-1">
            <button onClick={handleDelete} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete message" aria-label="Delete message">
              <Trash2 size={15} />
            </button>
          </div>
        )}

        {!message.isMine && (
          <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 shrink-0 mb-1">
            <button onClick={() => setReportOpen(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Report message" aria-label="Report message">
              <AlertCircle size={15} />
            </button>
          </div>
        )}
      </div>

      <ReportDialog messageId={message.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}

function ReportDialog({ messageId, open, onOpenChange }: { messageId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = useState<CommunityReportInputReason>('spam');
  const report = useReportCommunityMessage();
  const { toast } = useToast();

  const handleReport = () => {
    report.mutate({ id: messageId, data: { reason } }, {
      onSuccess: () => {
        toast({ title: 'Report submitted', description: 'Thank you for keeping the community safe.' });
        onOpenChange(false);
      }
    });
  };

  useEffect(() => {
    if (open) setReason('spam');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl border-border bg-card p-0 overflow-hidden">
        <DialogHeader className="border-b border-border bg-secondary/20 px-6 py-5">
          <DialogTitle className="cc-display text-2xl">Report Message</DialogTitle>
          <DialogDescription className="text-sm">
            Your report will be recorded. It is not automatically reviewed or resolved.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6">
          <label className="mb-2 block text-sm font-semibold">Reason for reporting</label>
          <select 
            value={reason} 
            onChange={e => setReason(e.target.value as CommunityReportInputReason)}
            className="field w-full"
          >
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="unsafe">Unsafe</option>
            <option value="other">Other</option>
          </select>
        </div>
        <DialogFooter className="px-6 pb-6 pt-2 gap-2">
          {report.isError && <p className="w-full text-xs text-destructive" role="alert">Could not submit the report. Please try again.</p>}
          <AppButton type="button" variant="quiet" onClick={() => onOpenChange(false)}>Cancel</AppButton>
          <AppButton type="button" variant="danger" onClick={handleReport} disabled={report.isPending}>
            {report.isPending ? 'Submitting...' : 'Submit Report'}
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageInput({ room }: { room: CommunityMessageRoom }) {
  const [body, setBody] = useState('');
  const [role, setRole] = useState<CommunityMessageAuthorRole>('student');
  const create = useCreateCommunityMessage();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || create.isPending) return;

    create.mutate({
      data: {
        room,
        body: body.trim(),
        authorRole: room === 'help' ? role : 'student'
      }
    }, {
      onSuccess: () => {
        setBody('');
        queryClient.invalidateQueries({ queryKey: getListCommunityMessagesQueryKey({ room }) });
      }
    });
  };

  useEffect(() => {
    if (room === 'students') setRole('student');
    setBody('');
  }, [room]);

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4 shrink-0">
      {room === 'help' && (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Post as:</label>
          <select 
            value={role} 
            onChange={e => setRole(e.target.value as CommunityMessageAuthorRole)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="student">Student</option>
            <option value="tutor">Self-described Tutor (not verified)</option>
            <option value="advisor">Self-described Advisor (not verified)</option>
          </select>
        </div>
      )}
      
      <div className="flex items-end gap-3">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={1000}
          aria-label={`Message the ${room} room`}
          placeholder={`Message the ${room} room...`}
          className="field max-h-32 min-h-[52px] flex-1 resize-y py-3.5 leading-relaxed"
          disabled={create.isPending}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <AppButton 
          type="submit" 
          disabled={!body.trim() || create.isPending}
          className="shrink-0 h-[52px] w-[52px] rounded-xl p-0"
          aria-label="Send message"
        >
          <Send size={18} className={body.trim() && !create.isPending ? 'text-primary-foreground' : 'opacity-50'} />
        </AppButton>
      </div>
      {create.isError && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">Failed to send message. Please wait a moment and try again.</p>
      )}
    </form>
  );
}
