import { useEffect, useState } from "react";

import { JobsPanel } from "./components/JobsPanel";
import { LogConsole } from "./components/LogConsole";
import { ReaperStatusPanel } from "./components/ReaperStatusPanel";
import { SimpleBatchPanel } from "./components/SimpleBatchPanel";
import {
  fetchBootstrap,
  openFileDialog,
  openFolderDialog,
  refreshEnvironment,
  refreshPluginCatalog,
  runSimpleBatch,
  subscribeToEvents,
} from "./lib/api";
import type {
  BatchJob,
  EngineState,
  PluginCatalogState,
  ReaperInfo,
  RenderProfile,
  SavedBatchSettings,
  StatePayload,
} from "./types";

const emptyEngine: EngineState = {
  running: false,
  cancelling: false,
  currentJobId: "",
  totalJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  queuedJobs: 0,
  startedAt: null,
  finishedAt: null,
};

const emptyReaper: ReaperInfo = {
  available: false,
  binaryPath: "",
  resourceDir: "",
  fxChainsDir: "",
  appDataDir: "",
  version: "",
};

const emptyPluginCatalog: PluginCatalogState = {
  plugins: [],
  loadedFromCache: false,
  cachePath: "",
  lastUpdatedAt: null,
};

function applyStatePayload(
  payload: StatePayload,
  setProfiles: (value: RenderProfile[]) => void,
  setSavedSettings: (value: SavedBatchSettings[]) => void,
  setPluginCatalog: (value: PluginCatalogState) => void,
  setJobs: (value: BatchJob[]) => void,
  setEngine: (value: EngineState) => void,
  setReaper: (value: ReaperInfo) => void,
) {
  setProfiles(payload.profiles);
  setSavedSettings(payload.savedSettings);
  setPluginCatalog(payload.pluginCatalog);
  setJobs(payload.jobs);
  setEngine(payload.engine);
  setReaper(payload.reaper);
}

export default function App() {
  const [profiles, setProfiles] = useState<RenderProfile[]>([]);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [savedSettings, setSavedSettings] = useState<SavedBatchSettings[]>([]);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalogState>(emptyPluginCatalog);
  const [engine, setEngine] = useState<EngineState>(emptyEngine);
  const [reaper, setReaper] = useState<ReaperInfo>(emptyReaper);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading BatchMaster...");
  const [error, setError] = useState("");
  const [streamConnected, setStreamConnected] = useState(false);

  const loadBootstrap = async () => {
    const payload = await fetchBootstrap();
    setProfiles(payload.profiles);
    setSavedSettings(payload.savedSettings);
    setPluginCatalog(payload.pluginCatalog);
    setJobs(payload.jobs);
    setEngine(payload.engine);
    setReaper(payload.reaper);
    setLogs(payload.logs);
    setStatus(payload.reaper.available ? "REAPER environment ready." : "REAPER binary was not detected.");
  };

  useEffect(() => {
    void loadBootstrap().catch((loadError: Error) => {
      setError(loadError.message);
    });

    const unsubscribe = subscribeToEvents({
      onState: (payload) => {
        setStreamConnected(true);
        applyStatePayload(payload, setProfiles, setSavedSettings, setPluginCatalog, setJobs, setEngine, setReaper);
      },
      onLogs: (snapshot) => {
        setStreamConnected(true);
        setLogs(snapshot);
      },
      onLog: (line) => {
        setStreamConnected(true);
        setLogs((current) => [...current, line].slice(-500));
      },
      onError: () => {
        setStreamConnected(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setError("");

    try {
      await action();
      await loadBootstrap();
      setStatus(label);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Production workflow</p>
          <h1>BatchMaster for REAPER</h1>
          <p className="hero-copy">
            Choose a folder, choose a saved `.RfxChain`, then batch export.
          </p>
        </div>
        <div className="hero-status">
          <div className={`badge ${reaper.available ? "badge-ok" : "badge-error"}`}>{reaper.available ? "Ready" : "Missing"}</div>
          <p>{status}</p>
          <p className={streamConnected ? "status-text" : "error-text"}>
            Live stream: {streamConnected ? "connected" : "disconnected"}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </header>

      <section className="dashboard">
        <ReaperStatusPanel
          reaper={reaper}
          pluginCatalog={pluginCatalog}
          engine={engine}
          onRefresh={() => void runAction("Environment refreshed.", async () => void (await refreshEnvironment()))}
          onRefreshPlugins={() => void runAction("Plugin catalog refreshed.", async () => void (await refreshPluginCatalog()))}
        />
        <SimpleBatchPanel
          engine={engine}
          onPickInputFolder={() => openFolderDialog({ prompt: "Choose input WAV folder" })}
          onPickFxChainFile={() => openFileDialog({ prompt: "Choose .RfxChain file", allowedExtensions: ["RfxChain", "rfxchain"] })}
          onRun={(input) => runAction("Batch started.", async () => void (await runSimpleBatch(input)))}
        />
        <JobsPanel
          jobs={jobs}
          compact
        />
        <LogConsole lines={logs} />
      </section>
    </main>
  );
}
