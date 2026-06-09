"use client";

import { useState } from "react";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";
import type { useMissions } from "@/hooks/useMissions";
import { MISSIONS } from "@/lib/missions";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Check, Lock, Sparkles, Pencil } from "lucide-react";

export function Missions({ m }: { m: ReturnType<typeof useMissions> }) {
  const { state, username, deployed, busy, claimMission, setUsername } = m;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const xp = state?.totalXp ?? 0;
  const level = state?.level ?? 1;
  const prog = state?.progress ?? { into: 0, need: 250, pct: 0 };

  return (
    <div className="space-y-5">
      <Panel label="Your Profile">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-ember-bright to-ember-deep text-black">
              <span className="font-mono text-lg font-bold">L{level}</span>
            </div>
            <div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    value={nameInput}
                    maxLength={32}
                    placeholder="username"
                    onChange={(e) => setNameInput(e.target.value)}
                    className="h-8 w-40 rounded-lg border border-border bg-bg px-2 text-sm outline-none focus:border-ember"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !nameInput.trim()}
                    onClick={async () => {
                      try {
                        await setUsername(nameInput.trim());
                        setEditingName(false);
                      } catch {
                        /* rejected */
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameInput(username);
                    setEditingName(true);
                  }}
                  className="group flex items-center gap-1.5 text-lg font-semibold text-text"
                  disabled={!deployed}
                >
                  {username || "Set username"}
                  <Pencil size={13} className="text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              <div className="tnum mt-1 text-xs text-muted">
                {fmtNum(xp, 0)} XP · {state?.claimedCount ?? 0}/{MISSIONS.length} missions
              </div>
            </div>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-dim">
              <span>Level {level}</span>
              <span>{prog.into}/{prog.need} XP</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full bg-gradient-to-r from-ember-deep via-ember to-ember-bright transition-all duration-700" style={{ width: `${prog.pct}%` }} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MISSIONS.map((m) => {
          const met = state?.met[m.id] ?? false;
          const done = state?.done[m.id] ?? false;
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-4 rounded-xl border bg-panel p-4 transition-colors",
                done ? "border-gain/30" : met ? "border-ember/40" : "border-border"
              )}
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-xl border",
                  done ? "border-gain/30 bg-gain/10 text-gain" : "border-border bg-bg text-ember"
                )}
              >
                {done ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-text">
                  {m.name}
                  <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] text-ember">+{m.xp} XP</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">{m.desc}</div>
              </div>
              {done ? (
                <span className="flex items-center gap-1 text-xs text-gain">
                  <Check size={13} /> Done
                </span>
              ) : met ? (
                <Button size="sm" disabled={busy} onClick={() => claimMission(m.id).catch(() => {})}>
                  <Sparkles size={13} /> Claim
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-dim">
                  <Lock size={12} /> Locked
                </span>
              )}
            </div>
          );
        })}
      </div>
      {!deployed && (
        <p className="text-center text-[11px] text-dim">Missions activate once the profile contract is deployed.</p>
      )}
    </div>
  );
}
