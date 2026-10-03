"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";

export interface ChatMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface Props {
  orderId: string;
  meId: string;
  names: Record<string, string>;
  initialMessages: ChatMessage[];
}

/**
 * Order chat. Reads and writes go straight from the browser with the user's
 * own session, so the messages RLS policies are the only gate. Realtime
 * delivers inserts, and Supabase re-checks the same SELECT policy for every
 * subscriber before it forwards a row.
 */
export function Chat({ orderId, meId, names, initialMessages }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, orderId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase.from("messages").insert({ order_id: orderId, body }).select("id, sender_id, body, created_at").single();
    if (error || !data) setError("Message not sent. Only the two people on this order can chat here.");
    else {
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
      setDraft("");
    }
    setSending(false);
  }

  return (
    <section className="card flex min-h-[28rem] flex-col">
      <h2 className="text-2xl font-medium">Chat</h2>
      <p className="mt-1 text-xs text-muted">Private to the two of you.</p>
      <ol className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length === 0 && <li className="text-sm text-muted">No messages yet. Say hello.</li>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <li key={m.id} className={`max-w-[85%] ${mine ? "self-end" : "self-start"}`}>
              <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? "bg-pencil text-white" : "bg-closed-soft"}`}>{m.body}</div>
              <div className={`mt-0.5 text-[11px] text-muted ${mine ? "text-right" : ""}`}>
                {mine ? "You" : names[m.sender_id] ?? "Them"} · {formatTime(m.created_at)}
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          id="chat-message"
          aria-label="Message"
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder="Write a message"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>Send</button>
      </form>
      {error && <p role="alert" className="alert alert-error mt-2 text-sm">{error}</p>}
    </section>
  );
}
