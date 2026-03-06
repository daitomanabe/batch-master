import type { EngineState, PluginCatalogState, ReaperInfo } from "../types";

type ReaperStatusPanelProps = {
  reaper: ReaperInfo;
  pluginCatalog: PluginCatalogState;
  engine: EngineState;
  onRefresh: () => void;
  onRefreshPlugins: () => void;
};

export function ReaperStatusPanel({ reaper, pluginCatalog, engine, onRefresh, onRefreshPlugins }: ReaperStatusPanelProps) {
  return (
    <section className="panel panel-status">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Environment</p>
          <h2>REAPER Engine</h2>
        </div>
        <div className="actions-row">
          <button className="button" onClick={onRefresh}>
            Refresh
          </button>
          <button className="button" onClick={onRefreshPlugins}>
            Refresh plugins
          </button>
        </div>
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

        <div className="status-card">
          <span className="badge">Plugins</span>
          <h3>Plugin Catalog</h3>
          <p>{pluginCatalog.plugins.length} plugins</p>
          <p>{pluginCatalog.loadedFromCache ? "Loaded from cache" : "Scanned from REAPER caches"}</p>
        </div>
      </div>
    </section>
  );
}
