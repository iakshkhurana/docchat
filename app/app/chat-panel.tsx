"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Markdown } from "@/components/markdown";
import { BotMark } from "@/components/icons";

function textOf(m: UIMessage): string {
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

function pagesOf(m: UIMessage): number[] {
  const part = m.parts.find((p) => p.type === "data-sources") as
    | { data?: { n: number; page: number }[] }
    | undefined;
  const pages = (part?.data ?? []).map((s) => s.page).filter((p) => p > 0);
  return [...new Set(pages)].sort((a, b) => a - b);
}

export default function ChatPanel({
  documentId,
  documentName,
  ready,
}: {
  documentId: string | null;
  documentName: string | null;
  ready: boolean;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the latest message (and streaming answer) in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";
  const canSend = Boolean(documentId) && ready && input.trim().length > 0 && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !documentId) return;
    sendMessage({ text: input }, { body: { documentId } });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col bg-[var(--ds-bg)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--ds-border)] px-5 py-4">
        <BotMark size={36} className="rounded-full ring-1 ring-white/10" />
        <div className="leading-tight">
          <p className="text-sm font-medium text-[var(--ds-text)]">AI Assistant</p>
          <p className="flex items-center gap-1 text-xs text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {ready ? "RAG Active" : "Waiting for a ready document"}
          </p>
        </div>
        <button
          onClick={() => {
            setMessages([]);
            setInput("");
          }}
          disabled={messages.length === 0}
          className="ml-auto rounded-lg px-2 py-1 text-sm text-[var(--ds-dim)] transition hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-text)] disabled:opacity-40"
          title="New chat"
        >
          + New chat
        </button>
      </div>

      {/* Messages */}
      <div className="scroll-ds flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-6">
        {/* Assistant greeting */}
        <div className="max-w-[85%] animate-fade">
          <div className="rounded-2xl rounded-tl-sm bg-[var(--ds-surface-2)] px-4 py-3 text-sm text-[var(--ds-text)]">
            Hello! I&apos;m ready to answer questions about your knowledge base.
            {documentName && ready ? (
              <>
                {" "}I have indexed <span className="text-blue-500">{documentName}</span>.
              </>
            ) : (
              " Upload a document and wait for it to be indexed."
            )}
          </div>
          <p className="mt-1 pl-1 text-[11px] text-[var(--ds-faint)]">just now</p>
        </div>

        {messages.map((m, i) => {
          const text = textOf(m);
          if (!text) return null;
          const isUser = m.role === "user";
          const isStreaming = status === "streaming" && i === messages.length - 1 && !isUser;
          return (
            <div key={m.id} className={`animate-in-up ${isUser ? "flex justify-end" : ""}`}>
              <div className="max-w-[85%]">
                {isUser ? (
                  <div className="rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-sm text-white whitespace-pre-wrap shadow-sm shadow-blue-600/20">
                    {text}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-[var(--ds-surface-2)] px-4 py-3 text-[var(--ds-text)]">
                    <Markdown>{text}</Markdown>
                    {isStreaming && <span className="stream-caret ml-0.5 text-blue-500">▋</span>}
                    {!isStreaming &&
                      (() => {
                        const pages = pagesOf(m);
                        if (!pages.length) return null;
                        return (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--ds-border)] pt-2.5">
                            <span className="text-[11px] text-[var(--ds-faint)]">Sources</span>
                            {pages.map((p) => (
                              <span
                                key={p}
                                className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-500"
                              >
                                p.{p}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="max-w-[85%] animate-in-up">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-[var(--ds-surface-2)] px-4 py-4 text-[var(--ds-dim)]">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
              <span
                className="typing-dot h-1.5 w-1.5 rounded-full bg-current"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="typing-dot h-1.5 w-1.5 rounded-full bg-current"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            Couldn&apos;t get a response. Make sure <code>OPENAI_API_KEY</code> is set correctly
            in <code>.env</code> and the worker has indexed this document.
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="border-t border-[var(--ds-border)] px-5 py-4">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 focus-within:border-blue-600/60">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              ready ? "Ask a question about your documents…" : "Select a ready document to chat…"
            }
            disabled={!ready}
            className="flex-1 bg-transparent text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-faint)] focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
            aria-label="Send"
          >
            ➤
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--ds-faint)]">
          AI can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
