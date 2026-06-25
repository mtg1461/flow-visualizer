"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "@/hooks/useEditorHistory";
import { LAST_PATH_KEY } from "@/hooks/useFileConnection";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Flow Visualizer failed to render", error, info);
  }

  private resetSavedState = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LAST_PATH_KEY);
    } catch {
      // Reloading is still useful if storage is blocked.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-shell flex h-dvh items-center justify-center p-5">
        <section className="material-panel w-full max-w-[520px] rounded-2xl border border-line-strong p-6">
          <h1 className="text-[17px] font-semibold">Flow Visualizer stopped</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
            The app hit a render error while restoring the current session.
            Clearing the saved browser state returns you to the file connection
            screen.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-line bg-well p-3 text-[11px] leading-relaxed text-faint shadow-inner">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={this.resetSavedState}
            className="mt-5 h-9 cursor-pointer rounded-lg border border-accent/70 bg-accent px-4 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Clear saved state
          </button>
        </section>
      </main>
    );
  }
}
