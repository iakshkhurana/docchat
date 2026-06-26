"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as "light" | "dark" | null) ?? "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-dim)] transition hover:bg-[var(--ds-hover)] hover:text-[var(--ds-text)]"
      title="Toggle light / dark"
    >
      {theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode"}
    </button>
  );
}
