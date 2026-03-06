import { useEffect, useState } from "react";

import { JobsPanel } from "./components/JobsPanel";
import { LogConsole } from "./components/LogConsole";
import { PluginCatalogPanel } from "./components/PluginCatalogPanel";
import { ProfilesPanel } from "./components/ProfilesPanel";
import { QueuePanel } from "./components/QueuePanel";
import { ReaperStatusPanel } from "./components/ReaperStatusPanel";
import {
  addJob,
  addBatchJobs,
  cancelBatch,
  clearFinishedJobs,
  createSavedSettings,
  createProfile,
  deleteSavedSettings,
  deleteProfile,
  fetchBootstrap,
  openFileDialog,
  openFolderDialog,
  queueFolderJobs,
  refreshEnvironment,
  refreshPluginCatalog,
  removeJob,
  retryJob,
  startBatch,
  subscribeToEvents,
  updateSavedSettings,
  updateProfile,
} from "./lib/api";
import type {
  BatchJob,
  EngineState,
  FxChainCandidate,
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
  setFxChains: (value: FxChainCandidate[]) => void,
) {
  setProfiles(payload.profiles);
  setSavedSettings(payload.savedSettings);
  setPluginCatalog(payload.pluginCatalog);
  setJobs(payload.jobs);
  setEngine(payload.engine);
  setReaper(payload.reaper);
  setFxChains(payload.fxChains);
}

export default function App() {
  const [profiles, setProfiles] = useState<RenderProfile[]>([]);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [savedSettings, setSavedSettings] = useState<SavedBatchSettings[]>([]);
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalogState>(emptyPluginCatalog);
  const [engine, setEngine] = useState<EngineState>(emptyEngine);
  const [reaper, setReaper] = useState<ReaperInfo>(emptyReaper);
  const [fxChains, setFxChains] = useState<FxChainCandidate[]>([]);
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
    setFxChains(payload.fxChains);
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
        applyStatePayload(payload, setProfiles, setSavedSettings, setPluginCatalog, setJobs, setEngine, setReaper, setFxChains);
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
            Queue offline renders, run REAPER in batch-convert mode, and debug startup or plugin-scan delays from a live console.
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
        <ProfilesPanel
          profiles={profiles}
          fxChains={fxChains}
          onPickFxChainPath={() => openFileDialog({ prompt: "Choose .RfxChain file", allowedExtensions: ["RfxChain", "rfxchain"] })}
          onCreate={(input) => runAction(`Profile created: ${input.name}`, async () => void (await createProfile(input)))}
          onUpdate={(profileId, input) => runAction("Profile updated.", async () => void (await updateProfile(profileId, input)))}
          onDelete={(profileId) => runAction("Profile deleted.", async () => void (await deleteProfile(profileId)))}
        />
        <QueuePanel
          profiles={profiles}
          savedSettings={savedSettings}
          engine={engine}
          onPickInputFile={() => openFileDialog({ prompt: "Choose input WAV file", allowedExtensions: ["wav", "wave"] })}
          onPickBulkFiles={() => openFileDialog({ prompt: "Choose WAV files", multiple: true, allowedExtensions: ["wav", "wave"] })}
          onPickFolder={(prompt, allowCreate) => openFolderDialog({ prompt, allowCreate })}
          onAddJob={(input) => runAction("Job queued.", async () => void (await addJob(input)))}
          onAddBatchJobs={(input) => runAction("Batch jobs queued.", async () => void (await addBatchJobs(input)))}
          onQueueFolder={(input) => runAction("Folder queued.", async () => void (await queueFolderJobs(input)))}
          onCreateSavedSettings={(input) => runAction(`Settings saved: ${input.name}`, async () => void (await createSavedSettings(input)))}
          onUpdateSavedSettings={(settingsId, input) =>
            runAction("Settings updated.", async () => void (await updateSavedSettings(settingsId, input)))
          }
          onDeleteSavedSettings={(settingsId) =>
            runAction("Settings deleted.", async () => void (await deleteSavedSettings(settingsId)))
          }
          onStart={() => runAction("Batch started.", async () => void (await startBatch()))}
          onCancel={() => runAction("Batch cancellation requested.", async () => void (await cancelBatch()))}
        />
        <JobsPanel
          jobs={jobs}
          onRetry={(jobId) => runAction("Job re-queued.", async () => void (await retryJob(jobId)))}
          onRemove={(jobId) => runAction("Job removed.", async () => void (await removeJob(jobId)))}
          onClearFinished={() => runAction("Finished jobs cleared.", async () => void (await clearFinishedJobs()))}
        />
        <PluginCatalogPanel pluginCatalog={pluginCatalog} />
        <LogConsole lines={logs} />
      </section>
    </main>
  );
}
