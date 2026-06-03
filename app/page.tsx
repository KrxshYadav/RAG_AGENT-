'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error, regenerate } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            R
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">RAG Chat</h1>
            <p className="text-xs text-muted-foreground">
              Knowledge base + Gemini fallback
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="mt-24 text-center text-muted-foreground">
              <p className="text-lg font-medium text-foreground">
                Ask me anything
              </p>
              <p className="mt-1 text-sm">
                I&apos;ll search the knowledge base first, then fall back to
                Gemini&apos;s own knowledge.
              </p>
            </div>
          )}

          {messages.map(m => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground'
                  }`}
                >
                  {m.parts.map((part, i) => {
                    switch (part.type) {
                      case 'text':
                        return (
                          <p key={i} className="whitespace-pre-wrap">
                            {part.text}
                          </p>
                        );
                      case 'tool-addResource':
                      case 'tool-getInformation':
                        return (
                          <p
                            key={i}
                            className="flex items-center gap-1.5 text-xs italic text-muted-foreground"
                          >
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                            {part.state === 'output-available'
                              ? 'searched'
                              : 'searching'}{' '}
                            the knowledge base…
                          </p>
                        );
                    }
                  })}
                </div>
              </div>
            );
          })}

          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p className="font-medium">{error.message}</p>
                <button
                  type="button"
                  onClick={() => regenerate()}
                  className="mt-2 rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium transition hover:bg-destructive/15"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background">
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!input.trim() || isLoading) return;
            sendMessage({ text: input });
            setInput('');
          }}
          className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4"
        >
          <input
            className="flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            value={input}
            placeholder="Say something…"
            onChange={e => setInput(e.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
