"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect, useAccount } from "wagmi";
import { Button, type ButtonProps } from "./ui/button";
import { liteforge } from "@/lib/chains";
import { cn } from "@/lib/cn";
import { Wallet, X, ExternalLink, AlertCircle, Loader2, ChevronRight } from "lucide-react";

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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  // Clear the per-wallet spinner if a connection attempt errors (e.g. user rejects).
  useEffect(() => {
    if (error) setConnectingId(null);
  }, [error]);

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
    setConnectingId(connector.uid);
    connect({ connector, chainId: liteforge.id });
    // Keep the modal open to show the per-wallet connecting state; it unmounts on success.
  }

  function closeModal() {
    setOpen(false);
    setConnectingId(null);
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

      {open && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={closeModal} />
          <div className="animate-pop relative flex max-h-[85vh] w-full max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border-strong bg-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85)]">
            {/* header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-ember-bright to-ember-deep text-black shadow-[0_2px_16px_-4px_rgba(244,99,42,0.7)]">
                <Wallet size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text">Connect a wallet</div>
                <div className="text-[11px] text-dim">Choose how to connect to LiteForge</div>
              </div>
              <button
                onClick={closeModal}
                className="grid h-7 w-7 place-items-center rounded-lg text-dim transition-colors hover:bg-panel-2 hover:text-text"
              >
                <X size={15} />
              </button>
            </div>

            {/* wallet list */}
            <div className="flex flex-col gap-1.5 overflow-y-auto p-3">
              {wallets.map((c) => {
                const busy = connectingId === c.uid && isPending;
                return (
                  <button
                    key={c.uid}
                    onClick={() => doConnect(c)}
                    disabled={isPending}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-bg px-3 py-3 text-left transition-all hover:border-ember/50 hover:bg-panel-2 disabled:opacity-60"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-panel">
                      {c.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.icon} alt="" className="h-9 w-9 object-cover" />
                      ) : (
                        <Wallet size={18} className="text-dim" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{c.name}</span>
                      <span className="block text-[11px] text-dim">
                        {busy ? "Confirm in your wallet…" : "Detected"}
                      </span>
                    </span>
                    {busy ? (
                      <Loader2 size={16} className="shrink-0 animate-spin text-ember" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-dim transition-colors group-hover:text-ember" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* error + footer */}
            {error && (
              <div className="shrink-0 border-t border-border px-5 py-3">
                <p className="flex items-start gap-1.5 text-xs text-loss">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {prettyError(error.message)}
                </p>
              </div>
            )}
            <div className="shrink-0 border-t border-border px-5 py-3 text-center">
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-dim transition-colors hover:text-ember"
              >
                New to wallets? Get MetaMask →
              </a>
            </div>
          </div>
        </div>,
        document.body
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
      No wallet detected. Install MetaMask <ExternalLink size={11} />
    </a>
  );
}

function prettyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rejected") || m.includes("denied")) return "Connection request rejected in your wallet.";
  if (m.includes("not found") || m.includes("no injected") || m.includes("provider"))
    return "No wallet found. Install MetaMask, then refresh.";
  if (m.includes("chain") || m.includes("network")) return "Couldn't switch to LiteForge. Approve the network in your wallet.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
