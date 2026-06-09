"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type DemoCtx = { isDemo: boolean; setDemo: (on: boolean) => void };

const Ctx = createContext<DemoCtx>({ isDemo: false, setDemo: () => {} });
const KEY = "forgemind.demo";

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    try {
      // `?demo=1` enables demo mode (shareable demo link), as does a prior opt-in.
      const fromUrl = new URLSearchParams(window.location.search).get("demo") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (fromUrl || localStorage.getItem(KEY) === "1") setIsDemo(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setDemo = (on: boolean) => {
    setIsDemo(on);
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ isDemo, setDemo }}>{children}</Ctx.Provider>;
}

export function useDemoMode() {
  return useContext(Ctx);
}
