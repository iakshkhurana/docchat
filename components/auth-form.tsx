"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignup || agreed) &&
    !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSignup ? { name, email, password } : { email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-6 text-white">
      {/* amber glow at top */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-[640px] -translate-x-1/2"
        style={{ background: "radial-gradient(circle, rgba(190,150,80,0.18), transparent 70%)" }}
      />

      {/* stacked card depth */}
      <div className="relative w-full max-w-md">
        <div className="absolute -inset-x-4 -top-4 bottom-8 rounded-[28px] border border-white/[0.04] bg-white/[0.015]" />
        <div className="absolute -inset-x-2 -top-2 bottom-4 rounded-[26px] border border-white/[0.05] bg-white/[0.02]" />

        <div className="animate-in-up relative rounded-3xl border border-white/10 bg-gradient-to-b from-[#1a1a1c] to-[#0e0e0f] p-8 shadow-2xl">
          <div className="flex flex-col items-center">
            <Logo size={44} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">
              {isSignup ? "Create account" : "Welcome back"}
            </h1>
            <p className="mt-2 max-w-xs text-center text-sm text-neutral-400">
              {isSignup
                ? "Turn your documents into answers. Grounded, cited, instant."
                : "Log in to chat with your documents."}
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-3">
            {isSignup && (
              <Field label="Name (optional)" type="text" value={name} onChange={setName} required={false} />
            )}
            <Field label="Email address" type="email" value={email} onChange={setEmail} />
            <Field
              label={isSignup ? "Password (min. 6 characters)" : "Password"}
              type="password"
              value={password}
              onChange={setPassword}
            />

            {isSignup && (
              <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/5 accent-white"
                />
                <span>
                  By creating an account, I agree to the{" "}
                  <span className="text-neutral-200">Terms of Service</span> and{" "}
                  <span className="text-neutral-200">Privacy Policy</span>.
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 w-full rounded-xl bg-white py-3 font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
            >
              {loading ? "Please wait…" : isSignup ? "Create account" : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            {isSignup ? "Already have an account? " : "Don't have an account? "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              className="font-medium text-white hover:underline"
            >
              {isSignup ? "Log in" : "Sign up"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  required = true,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 transition focus-within:border-white/25">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        required={required}
        className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
      />
    </div>
  );
}
