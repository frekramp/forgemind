"use client";

import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * #17: catches render crashes in a subtree so one bad tab or malformed RPC response can't
 * blank the whole dashboard. Error boundaries must be class components.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("ErrorBoundary caught:", error instanceof Error ? error.message : error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel py-12 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ember-soft text-ember">
            <TriangleAlert size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-text">
              Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}.
            </p>
            <p className="mt-1 text-xs text-muted">This view hit an error - try again or switch tabs.</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text transition-colors hover:border-ember hover:text-ember"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
