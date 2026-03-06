export type JobStatus = "queued" | "processing" | "done" | "error" | "cancelled";

export type RenderProfile = {
  id: string;
  name: string;
  fxChainPath: string | null;
  importedFxChainPath: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedBatchSettings = {
  id: string;
  name: string;
  profileId: string;
  inputDirectory: string;
  outputBaseDirectory: string;
  recursive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PluginInfo = {
  id: string;
  name: string;
  vendor: string;
  format: "VST" | "VST3" | "AU" | "CLAP";
  instrument: boolean;
  sourceFile: string;
};

export type PluginCatalogState = {
  plugins: PluginInfo[];
  loadedFromCache: boolean;
  cachePath: string;
  lastUpdatedAt: string | null;
};

export type BatchJob = {
  id: string;
  profileId: string;
  profileName: string;
  inputPath: string;
  outputPath: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  errorMessage: string;
  startedAt: string | null;
  completedAt: string | null;
  splashLogPath: string | null;
  stderrLogPath: string | null;
};

export type EngineState = {
  running: boolean;
  cancelling: boolean;
  currentJobId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  queuedJobs: number;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ReaperInfo = {
  available: boolean;
  binaryPath: string;
  resourceDir: string;
  fxChainsDir: string;
  appDataDir: string;
  version: string;
};

export type FxChainCandidate = {
  id: string;
  name: string;
  path: string;
  source: "reaper" | "managed";
};

export type BootstrapPayload = {
  profiles: RenderProfile[];
  savedSettings: SavedBatchSettings[];
  pluginCatalog: PluginCatalogState;
  jobs: BatchJob[];
  engine: EngineState;
  logs: string[];
  reaper: ReaperInfo;
  fxChains: FxChainCandidate[];
};

export type StateEventPayload = Omit<BootstrapPayload, "logs">;
