import { useEffect, useRef } from "react";

type LogConsoleProps = {
  lines: string[];
};

export function LogConsole({ lines }: LogConsoleProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [lines]);

  return (
    <section className="panel panel-console">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Debug</p>
          <h2>Engine Console</h2>
        </div>
      </div>

      <div className="console-viewport" ref={viewportRef}>
        {lines.length === 0 ? <div className="empty-state">No logs yet.</div> : <pre className="console-log">{lines.join("\n")}</pre>}
      </div>
    </section>
  );
}
