import Link from "next/link";
import { Logo } from "@/components/logo";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#080808] text-white">
      {/* grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)",
        }}
      />
      {/* amber glow, top-left */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(214,168,72,0.30), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Nav */}
        <header className="flex items-center justify-between pt-7">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <span className="text-lg font-semibold">DocChat</span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="hidden px-3 py-2 text-neutral-300 transition hover:text-white sm:block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-blue-500/60 bg-blue-500/10 px-5 py-2 font-medium text-white shadow-[0_0_20px_-4px_rgba(59,130,246,0.6)] transition hover:bg-blue-500/20"
            >
              Get started
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <main className="flex flex-col items-center pt-28 text-center sm:pt-36">
          {/* pill with side lines */}
          <div className="flex items-center gap-3">
            <span className="hidden h-px w-24 bg-gradient-to-r from-transparent to-blue-500/50 sm:block" />
            <span className="rounded-full border border-white/15 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-neutral-300">
              Retrieval-Augmented
            </span>
            <span className="hidden h-px w-24 bg-gradient-to-l from-transparent to-blue-500/50 sm:block" />
          </div>

          <h1 className="mt-8 max-w-3xl text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            <span className="block font-serif font-normal text-neutral-200">
              Answers grounded in your
            </span>
            <span className="mt-1 block font-bold">Own Documents</span>
          </h1>

          <p className="mt-6 max-w-md text-base text-neutral-400">
            Streamed in real time, cited to the page, never outside your content.
          </p>

          <Link
            href="/signup"
            className="group mt-10 flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 font-medium text-white shadow-[0_0_30px_-6px_rgba(59,130,246,0.8)] transition hover:bg-blue-700"
          >
            Get started
            <span className="transition-transform group-hover:translate-x-0.5">↗</span>
          </Link>

          <p className="mt-24 pb-16 text-sm text-neutral-600">
            Powered by Next.js · ChromaDB · Redis · Vercel AI SDK
          </p>
        </main>
      </div>
    </div>
  );
}
