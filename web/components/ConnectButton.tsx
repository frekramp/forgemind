"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnect, useAccount } from "wagmi";
import { Button, type ButtonProps } from "./ui/button";
import { liteforge } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { Wallet, X, ExternalLink, AlertCircle } from "lucide-react";

/**
 * Robust connect flow:
 * - De-dupes EIP-6963 discovered wallets + the configured injected connector.
 * - If exactly one wallet, connects directly; if several, shows a picker.
 * - If no wallet is detected, links to install MetaMask.
 * - Surfaces connect errors instead of silently swallowing them.
 */
export function ConnectButton({
  size = "md",
  className,
  label = "Connect Wallet",
}: {
  size?: ButtonProps["size"];
  className?: string;
  label?: string;
}) {
  const { isConnected } = useAccount();
  const { connect, connectors, error, isPending, reset } = useConnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // De-dupe connectors by name. When EIP-6963 has discovered real wallets
  // (Rabby, MetaMask…), drop the generic "Injected" fallback so the picker shows
  // named wallets only; if nothing was discovered, keep the generic one.
  const wallets = useMemo(() => {
    const seen = new Set<string>();
    const deduped = connectors.filter((c) => {
      const key = (c.name || c.id).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const named = deduped.filter((c) => c.id !== "injected" && c.name.toLowerCase() !== "injected");
    return named.length > 0 ? named : deduped;
  }, [connectors]);

  // Before mount, render a static button to avoid hydration mismatch.
  const hasWallet =
    mounted && (wallets.length > 0 || (typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum));

  if (isConnected) return null;

  function doConnect(connector: (typeof connectors)[number]) {
    reset();
    connect({ connector, chainId: liteforge.id });
    setOpen(false);
  }

  function onClick() {
    if (!hasWallet) {
      window.open("https://metamask.io/download/", "_blank", "noopener,noreferrer");
      return;
    }
    if (wallets.length === 1) {
      doConnect(wallets[0]);
    } else {
      setOpen(true);
    }
  }

  return (
    <div className={cn("inline-flex flex-col items-stretch gap-2", className)}>
      <Button size={size} onClick={onClick} disabled={isPending}>
        <Wallet size={size === "lg" ? 18 : 15} />
        {isPending ? "Connecting…" : !mounted ? label : hasWallet ? label : "Install a Wallet"}
      </Button>

      {error && (
        <p className="flex items-start gap-1.5 text-left text-xs text-loss">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {prettyError(error.message)}
        </p>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-panel p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Choose a wallet</span>
              <button onClick={() => setOpen(false)} className="text-dim hover:text-text">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1.5">
              {wallets.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => doConnect(c)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2.5 text-left text-sm transition-colors hover:border-ember hover:text-ember"
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" className="h-5 w-5 rounded" />
                  ) : (
                    <Wallet size={18} className="text-dim" />
                  )}
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** No-wallet helper shown on the landing hero. */
export function NoWalletHint() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hasWallet = mounted && typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum;
  if (!mounted || hasWallet) return null;
  return (
    <a
      href="https://metamask.io/download/"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1 text-xs text-dim transition-colors hover:text-ember"
    >
      No wallet detected — install MetaMask <ExternalLink size={11} />
    </a>
  );
}

function prettyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rejected") || m.includes("denied")) return "Connection request rejected in your wallet.";
  if (m.includes("not found") || m.includes("no injected") || m.includes("provider"))
    return "No wallet found. Install MetaMask, then refresh.";
  if (m.includes("chain") || m.includes("network")) return "Couldn't switch to LiteForge — approve the network in your wallet.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
