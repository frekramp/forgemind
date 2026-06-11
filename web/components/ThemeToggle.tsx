"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/** Light/dark toggle. Dark is the default; flips the `dark` class on <html> (CSS vars do the
 *  rest), persists the choice, and adds a brief `.theme-transition` so colors crossfade. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("forgemind.theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
    window.setTimeout(() => root.classList.remove("theme-transition"), 450);
  }

  if (!mounted) return <span className="h-9 w-9" aria-hidden />;

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle light or dark theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted transition-colors hover:border-ember hover:text-ember"
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
