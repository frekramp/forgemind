"use client";

import { useAccount, useBalance, useDisconnect, useSwitchChain } from "wagmi";
import { Flame } from "lucide-react";
import { Button } from "./ui/button";
import { ConnectButton } from "./ConnectButton";
import { ShareStackButton } from "./ShareStack";
import { liteforge } from "@/lib/chains";
import { fmtNum, shortAddr, weiToNum } from "@/lib/format";

export function Header() {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { enabled: !!address } });
  const wrongChain = isConnected && chainId !== liteforge.id;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-ember-bright to-ember-deep text-black shadow-[0_2px_16px_-4px_rgba(244,99,42,0.7)]">
            <Flame size={18} />
          </div>
          <div className="leading-none">
            <div className="text-[15px] font-semibold tracking-tight">ForgeMind</div>
            <div className="label mt-1.5">zkLTC smart vault</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse-ember" />
            LiteForge · testnet
          </span>
          {!isConnected ? (
            <ConnectButton />
          ) : wrongChain ? (
            <Button variant="danger" onClick={() => switchChain({ chainId: liteforge.id })}>
              Switch to LiteForge
            </Button>
          ) : (
            <>
              <ShareStackButton />
              <button
                onClick={() => disconnect()}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-border-strong"
                title="Disconnect"
              >
                <span className="tnum font-mono text-ember">{fmtNum(bal ? weiToNum(bal.value) : 0, 3)} zkLTC</span>
                <span className="text-muted">{shortAddr(address)}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
