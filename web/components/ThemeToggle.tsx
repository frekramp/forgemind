"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/** Light/dark toggle. Flips the `light` class on <html> (CSS vars do the rest), persists the
 *  choice, and adds a brief `.theme-transition` so colors crossfade instead of snapping. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    const next = !root.classList.contains("light");
    root.classList.toggle("light", next);
    try {
      localStorage.setItem("forgemind.theme", next ? "light" : "dark");
    } catch {
      /* ignore */
    }
    setLight(next);
    window.setTimeout(() => root.classList.remove("theme-transition"), 420);
  }

  // Static placeholder pre-mount to avoid a hydration mismatch on the icon.
  if (!mounted) return <span className="h-8 w-8" aria-hidden />;

  return (
    <button
      onClick={toggle}
      title={light ? "Switch to dark" : "Switch to light"}
      aria-label="Toggle light or dark theme"
      className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition-colors hover:border-ember hover:text-ember"
    >
      {light ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
