"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ChatHistoryMessage } from "@/lib/types";

type ChatPageProps = {
  initialMessages: ChatHistoryMessage[];
};

type ChatResponse = {
  response: string;
};

export function ChatPage({ initialMessages }: ChatPageProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

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
          body: JSON.stringify({ message: nextMessage }),
        });

        if (!response.ok) {
          throw new Error("Request failed");
        }

        const payload = (await response.json()) as ChatResponse;
        const assistantMessage: ChatHistoryMessage = {
          id: Date.now() + 1,
          role: "assistant",
          content: payload.response,
          created_at: new Date().toISOString(),
        };

        setMessages((current) => [...current, assistantMessage]);
      } catch (submissionError) {
        console.error(submissionError);
        setError("The message could not be sent. Check your env setup and try again.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="grid flex-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="flex min-h-[70vh] flex-col overflow-hidden">
          <CardHeader className="border-b border-zinc-900/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Badge className="mb-3" variant="secondary">
                  Conversational control center
                </Badge>
                <CardTitle className="text-2xl">
                  Talk to amaze like it already knows your day
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-80 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/80 p-6 text-center text-sm text-zinc-500">
                  Start with something natural like "add my DSA assignment due Friday" or
                  "what do I have today?".
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
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
                        isUser
                          ? "bg-emerald-400 text-black"
                          : "border border-zinc-800 bg-zinc-950 text-zinc-100"
                      }`}
                    >
                      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] opacity-70">
                        {isUser ? "You" : "Amaze"}
                      </p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                );
              })}

              {isSubmitting ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
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

            <div className="border-t border-zinc-900/80 p-4 sm:p-5">
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
                  className="min-h-28 resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    Enter sends. Shift+Enter adds a new line.
                  </p>
                  <Button
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

        <Card className="h-fit">
          <CardHeader>
            <Badge variant="outline" className="mb-3 w-fit">
              What it can do
            </Badge>
            <CardTitle className="text-xl">One thread for college, work, and career</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-zinc-300">
            <div className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
              "Add my CN assignment due 2026-05-30"
            </div>
            <div className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
              "Show my pending assignments"
            </div>
            <div className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
              "What GitHub work did I do this week?"
            </div>
            <div className="rounded-lg border border-zinc-900 bg-zinc-950/80 p-4">
              "What's on my calendar today?"
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
