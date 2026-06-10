// Shared types between the agent API route and the chat UI.
export type AutoPilotStrategy = "compound" | "dca" | "off";

export type AgentAction =
  | { type: "deposit"; amount: string; label: string }
  | { type: "withdraw"; amount: string; label: string }
  | { type: "setMode"; mode: 0 | 1; label: string }
  | { type: "setGoal"; amount: string; label: string }
  | { type: "claimYield"; label: string }
  | { type: "claimMission"; missionId: number; label: string }
  | { type: "enableAutoPilot"; strategy: AutoPilotStrategy; cap: string; label: string };

/** One step of the agent's reasoning - a tool it called, surfaced to the UI so the
 *  multi-step tool use is visible rather than hidden behind the final answer. */
export type TraceStep = {
  kind: "read" | "prepare"; // read = inspected on-chain state; prepare = staged a tx
  label: string; // e.g. "Read live vault state" / "Prepared: Deposit 10 zkLTC"
  detail?: string; // short result summary, e.g. "Grow · 12.3 zkLTC · 421d to halving"
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: AgentAction[];
  trace?: TraceStep[];
};

export type AgentResponse = {
  text: string;
  actions: AgentAction[];
  trace: TraceStep[];
  engine: "claude" | "rules";
};
