"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { BookIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";
import ChatPanel from "./chat-panel";

interface Doc {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  error: string | null;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ready: { label: "Indexed", className: "bg-emerald-500/15 text-emerald-500" },
  processing: { label: "Processing", className: "bg-amber-500/15 text-amber-500" },
  queued: { label: "Queued", className: "bg-amber-500/15 text-amber-500" },
  failed: { label: "Failed", className: "bg-red-500/15 text-red-500" },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return "Today";
  if (diff < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString();
}

export default function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) return;
      const { documents } = (await res.json()) as { documents: Doc[] };
      setDocs(documents);
      setSelectedId((prev) =>
        prev && documents.some((d) => d.id === prev)
          ? prev
          : documents.find((d) => d.status === "ready")?.id ?? null,
      );
    } catch {
      /* ignore transient polling errors */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/upload", { method: "POST", body: form });
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) upload(file);
  }

  async function remove(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (selectedId === id) setSelectedId(null);
    await refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const selected = docs.find((d) => d.id === selectedId) ?? null;
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <div className="grid h-screen w-full grid-cols-[260px_minmax(0,1fr)_minmax(0,440px)] bg-[var(--ds-bg)] text-[var(--ds-text)]">
      {/* ───────────── Sidebar ───────────── */}
      <aside className="flex flex-col border-r border-[var(--ds-border)] px-4 py-5">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo size={34} />
          <span className="text-base font-semibold text-[var(--ds-text)]">DocChat</span>
        </div>

        <span className="flex items-center gap-2 rounded-lg border-l-2 border-blue-500 bg-gradient-to-r from-blue-600/20 to-transparent px-3 py-2 text-sm font-medium text-blue-500">
          <BookIcon size={17} /> Knowledge Base
        </span>

        <p className="mt-6 px-3 text-xs text-[var(--ds-faint)]">
          {docs.length} document{docs.length === 1 ? "" : "s"} ·{" "}
          {docs.filter((d) => d.status === "ready").length} indexed
        </p>

        {/* Theme toggle + user + logout */}
        <div className="mt-auto space-y-3 border-t border-[var(--ds-border)] pt-4">
          <ThemeToggle />
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-[var(--ds-text)]">
                {user.name ?? "Account"}
              </p>
              <p className="truncate text-xs text-[var(--ds-dim)]">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-dim)] transition hover:bg-[var(--ds-hover)] hover:text-[var(--ds-text)]"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ───────────── Knowledge column ───────────── */}
      <section className="flex flex-col overflow-hidden border-r border-[var(--ds-border)]">
        {/* greeting header */}
        <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-6 py-4">
          <div>
            <h1 className="text-base font-semibold text-[var(--ds-text)]">
              Welcome back, {(user.name ?? user.email).split(/[ @]/)[0]} 👋
            </h1>
            <p className="text-xs text-[var(--ds-dim)]">
              Upload a PDF and start asking questions about it.
            </p>
          </div>
          <span className="rounded-full border border-[var(--ds-border)] px-3 py-1 text-xs text-[var(--ds-dim)]">
            {docs.filter((d) => d.status === "ready").length}/{docs.length} ready
          </span>
        </div>

        <div className="px-6 py-5">
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragOver
                ? "border-blue-600 bg-blue-600/10 scale-[1.01]"
                : "border-[var(--ds-border)] hover:border-blue-600/50 hover:bg-blue-600/[0.03]"
            }`}
          >
            <div
              className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg text-white transition group-hover:scale-110 ${
                uploading ? "animate-pulse" : ""
              }`}
            >
              ⬆
            </div>
            <p className="text-sm font-medium text-[var(--ds-text)]">
              {uploading ? "Uploading…" : "Click to upload or drag and drop"}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-faint)]">PDF · up to 10MB</p>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 pb-3">
          <p className="text-sm text-[var(--ds-text)]">Knowledge Base</p>
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Add New
          </button>
        </div>

        {/* File list */}
        <div className="scroll-ds flex-1 overflow-y-auto px-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--ds-faint)]">
            <span>File name</span>
            <span>Status</span>
            <span>Added</span>
            <span />
          </div>

          {docs.length === 0 ? (
            <div className="animate-fade flex flex-col items-center px-3 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ds-surface-2)] text-2xl">
                📄
              </div>
              <p className="text-sm font-medium text-[var(--ds-text)]">No documents yet</p>
              <p className="mt-1 max-w-xs text-xs text-[var(--ds-dim)]">
                Upload a PDF above and it&apos;ll be parsed, embedded, and ready to chat in seconds.
              </p>
            </div>
          ) : (
            docs.map((d) => {
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.queued;
              const active = d.id === selectedId;
              const live = d.status === "processing" || d.status === "queued";
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`group grid w-full animate-in-up cursor-pointer grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-xl border-l-2 px-3 py-3 text-left transition ${
                    active
                      ? "border-blue-500 bg-[var(--ds-surface-2)]"
                      : "border-transparent hover:translate-x-0.5 hover:bg-[var(--ds-hover)]"
                  }`}
                >
                  <span className="flex items-center gap-3 truncate">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[var(--ds-surface-2)] to-[var(--ds-hover)] text-xs">
                      📄
                    </span>
                    <span className="truncate text-sm text-[var(--ds-text)]">{d.filename}</span>
                  </span>
                  <span
                    title={d.status === "failed" && d.error ? d.error : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className} ${
                      d.status === "failed" ? "cursor-help" : ""
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full bg-current ${live ? "pulse-dot" : ""}`} />
                    {badge.label}
                  </span>
                  <span className="text-xs text-[var(--ds-dim)]">{timeAgo(d.createdAt)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(d.id);
                    }}
                    className="text-[var(--ds-faint)] opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                    aria-label="Delete document"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ───────────── Chat column ───────────── */}
      <section className="overflow-hidden">
        <ChatPanel
          key={selectedId ?? "none"}
          documentId={selectedId}
          documentName={selected?.filename ?? null}
          ready={selected?.status === "ready"}
        />
      </section>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete document?"
        message={`"${docs.find((d) => d.id === confirmId)?.filename ?? "This document"}" and its chat history will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmId) remove(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
