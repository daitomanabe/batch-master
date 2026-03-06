import type { EngineState, ReaperInfo } from "../types";

type ReaperStatusPanelProps = {
  reaper: ReaperInfo;
  engine: EngineState;
  onRefresh: () => void;
};

export function ReaperStatusPanel({ reaper, engine, onRefresh }: ReaperStatusPanelProps) {
  return (
    <section className="panel panel-status">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Environment</p>
          <h2>REAPER Engine</h2>
        </div>
        <button className="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <span className={`badge ${reaper.available ? "badge-ok" : "badge-error"}`}>
            {reaper.available ? "Detected" : "Missing"}
          </span>
          <h3>Binary</h3>
          <code>{reaper.binaryPath}</code>
          <p>Version: {reaper.version || "Unknown"}</p>
        </div>

        <div className="status-card">
          <span className={`badge ${engine.running ? "badge-warn" : "badge-ok"}`}>{engine.running ? "Running" : "Idle"}</span>
          <h3>Queue</h3>
          <p>
            {engine.completedJobs} / {engine.totalJobs} completed
          </p>
          <p>{engine.queuedJobs} queued</p>
        </div>

        <div className="status-card">
          <span className="badge">Resources</span>
          <h3>REAPER Resource Dir</h3>
          <code>{reaper.resourceDir}</code>
          <code>{reaper.fxChainsDir}</code>
        </div>

        <div className="status-card">
          <span className="badge">App Data</span>
          <h3>BatchMaster State Dir</h3>
          <code>{reaper.appDataDir}</code>
        </div>
      </div>
    </section>
  );
}
