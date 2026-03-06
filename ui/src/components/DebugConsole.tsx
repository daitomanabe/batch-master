import { useEffect, useRef } from "react";

type DebugConsoleProps = {
  lines: string[];
  scanning: boolean;
  onClear: () => void;
};

export function DebugConsole({ lines, scanning, onClear }: DebugConsoleProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!viewportRef.current) {
      return;
    }

    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [lines]);

  return (
    <section className="panel panel-console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Debug</p>
          <h2>Scan Console</h2>
        </div>
        <div className="queue-summary">
          <div className="pill">{scanning ? "Scanning" : "Idle"}</div>
          <button className="button" onClick={onClear}>
            Clear log
          </button>
        </div>
      </div>

      <div className="console-viewport" ref={viewportRef}>
        {lines.length === 0 ? (
          <div className="empty-state">No scan logs yet.</div>
        ) : (
          <pre className="console-log">{lines.join("\n")}</pre>
        )}
      </div>
    </section>
  );
}
