"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, MessageSquarePlus, Send } from "lucide-react";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { readClientCache, writeClientCache } from "@/lib/client-cache";
import type { ChatHistoryMessage, ChatSession } from "@/lib/types";

type ChatPageProps = {
  initialActiveSessionId: number | null;
  initialMessages: ChatHistoryMessage[];
  initialSessions: ChatSession[];
};

type ChatPayload = {
  activeSessionId: number | null;
  messages: ChatHistoryMessage[];
  sessions: ChatSession[];
};

type ChatPostPayload = {
  sessionId: number;
  sessions: ChatSession[];
};

const chatCacheMaxAgeMs = 5 * 60 * 1000;

function getChatCacheKey(sessionId: number | null) {
  return `amaze:chat:v1:${sessionId ?? "latest"}`;
}

async function getResponseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "The message could not be sent. Please try again.";
  } catch {
    return "The message could not be sent. Please try again.";
  }
}

function formatSessionDate(value: string) {
  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalizedValue);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getDate()} ${months[date.getMonth()]}`;
}

function getSessionPreview(session: ChatSession) {
  return session.last_message?.trim() || "No messages yet";
}

export function ChatPage({
  initialActiveSessionId,
  initialMessages,
  initialSessions,
}: ChatPageProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    initialActiveSessionId,
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const pathname = usePathname();
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const visibleSessions = useMemo(
    () => (isHistoryExpanded ? sessions : sessions.slice(0, 8)),
    [isHistoryExpanded, sessions],
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

  useEffect(() => {
    writeClientCache(getChatCacheKey(activeSessionId), {
      activeSessionId,
      messages,
      sessions,
    } satisfies ChatPayload);
  }, [activeSessionId, messages, sessions]);

  async function refreshMessages(sessionId = activeSessionId) {
    const cachedPayload = readClientCache<ChatPayload>(
      getChatCacheKey(sessionId),
      chatCacheMaxAgeMs,
    );

    if (cachedPayload) {
      setActiveSessionId(cachedPayload.activeSessionId);
      setMessages(cachedPayload.messages);
      setSessions(cachedPayload.sessions);
    }

    const params = new URLSearchParams();

    if (sessionId) {
      params.set("sessionId", String(sessionId));
    }

    const query = params.toString();
    const response = await fetch(query ? `/api/chat?${query}` : "/api/chat", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Chat history request failed");
    }

    const payload = (await response.json()) as ChatPayload;
    setActiveSessionId(payload.activeSessionId);
    setMessages(payload.messages);
    setSessions(payload.sessions);
    writeClientCache(getChatCacheKey(payload.activeSessionId), payload);
  }

  function handleNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setDraft("");
    setError(null);
  }

  function handleOpenSession(sessionId: number) {
    setError(null);
    setActiveSessionId(sessionId);

    void refreshMessages(sessionId);
  }

  function handleSubmit() {
    const nextMessage = draft.trim();
    if (!nextMessage) {
      return;
    }

    setError(null);
    setDraft("");

    const optimisticUserMessage: ChatHistoryMessage = {
      id: Date.now(),
      role: "user",
      content: nextMessage,
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticUserMessage]);

    setIsSubmitting(true);

    void (async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: nextMessage, sessionId: activeSessionId }),
        });

        if (!response.ok) {
          throw new Error(await getResponseErrorMessage(response));
        }

        const payload = (await response.json()) as ChatPostPayload;
        setActiveSessionId(payload.sessionId);
        setSessions(payload.sessions);
        await refreshMessages(payload.sessionId);
        window.dispatchEvent(new Event("amaze-dashboard-refresh"));

        if (pathname === "/dashboard") {
          await fetch("/api/dashboard", { cache: "no-store" });
        }
      } catch (submissionError) {
        console.warn(
          "Chat submission failed",
          submissionError instanceof Error ? submissionError.message : submissionError,
        );
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "The message could not be sent. Please try again.",
        );
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-9rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:gap-6">
        <Card className="flex h-[calc(100dvh-10rem)] min-h-[420px] flex-col overflow-hidden sm:h-[calc(100dvh-11rem)] sm:min-h-[520px] lg:h-full lg:min-h-0">
          <CardHeader className="shrink-0 border-b border-zinc-900/80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Badge className="mb-3" variant="secondary">
                  Conversational control center
                </Badge>
                <CardTitle className="text-xl sm:text-2xl">
                  Talk to amaze like it already knows your day
                </CardTitle>
              </div>
              <Button variant="outline" className="w-full sm:w-auto" onClick={handleNewChat}>
                <MessageSquarePlus className="size-4" />
                New chat
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/80 p-5 text-center text-sm text-zinc-500">
                  Start with something natural like &quot;add my DSA assignment due Friday&quot; or
                  &quot;what do I have today?&quot;.
                </div>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[85%] ${
                        isUser
                          ? "bg-emerald-400 text-black"
                          : "border border-zinc-800 bg-zinc-950 text-zinc-100"
                      }`}
                    >
                      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] opacity-70">
                        {isUser ? "You" : "Amaze"}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                );
              })}

              {isSubmitting ? (
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300 sm:max-w-[85%]">
                    <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                      <Loader2 className="size-3 animate-spin" />
                      Gemini is thinking
                    </div>
                    <p>Pulling context together...</p>
                  </div>
                </div>
              ) : null}

              <div ref={scrollAnchorRef} />
            </div>

            <div className="shrink-0 border-t border-zinc-900/80 p-3 sm:p-5">
              <div className="space-y-3">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Plan my day, add work, query GitHub, or clean up assignments..."
                  className="min-h-20 resize-none sm:min-h-28"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">
                    Enter sends. Shift+Enter adds a new line.
                  </p>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={handleSubmit}
                    disabled={isSubmitting || draft.trim().length === 0}
                  >
                    <Send className="size-4" />
                    Send
                  </Button>
                </div>
                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden lg:flex lg:h-full lg:flex-col">
          <CardHeader className="shrink-0">
            <Badge variant="outline" className="mb-3 w-fit">
              <History className="mr-1 size-3" />
              Chat history
            </Badge>
            <CardTitle className="text-xl">Previous conversations</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 space-y-3 overflow-y-auto overscroll-contain text-sm leading-7 text-zinc-300">
            <Button variant="outline" className="w-full justify-start" onClick={handleNewChat}>
              <MessageSquarePlus className="size-4" />
              New chat
            </Button>

            {sessions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-zinc-500">
                No saved chats yet.
              </div>
            ) : null}

            {visibleSessions.map((session) => {
              const isActive = session.id === activeSessionId;

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleOpenSession(session.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "border-emerald-400 bg-emerald-400/10 text-zinc-50"
                      : "border-zinc-900 bg-zinc-950/80 text-zinc-300 hover:border-zinc-700"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="line-clamp-1 min-w-0 font-medium">{session.title}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatSessionDate(session.updated_at)}
                    </span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xs text-zinc-500">
                    {getSessionPreview(session)}
                  </span>
                </button>
              );
            })}

            {sessions.length > visibleSessions.length ? (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setIsHistoryExpanded(true)}
              >
                Show more
              </Button>
            ) : null}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
